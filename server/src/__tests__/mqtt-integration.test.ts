/**
 * MQTT → Database Telemetry Pipeline — Integration Tests
 *
 * Proves the documentation claim:
 *   "JSON telemetry packets sent via MQTT are correctly parsed by the Node.js
 *    backend and stored in the SQLite3 database without corruption."
 *
 * Full data flow under test:
 *   MQTT publish → Aedes broker → JSON.parse() → insertTelemetry() → SQLite DB
 *                                                                           ↓
 *                                                 getRecentTelemetry() → verify integrity
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import type { TelemetryData, DeviceCommand, WsMessage, DeviceStatusMessage } from "../../../shared/types";

// ─── Module mocks (same pattern as database.test.ts) ───────────────────────

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

vi.mock("path", async (importOriginal) => {
  const actual = await importOriginal<typeof import("path")>();
  return {
    ...actual,
    default: {
      ...actual,
      join: (...args: string[]) => actual.join(...args),
    },
  };
});

vi.mock("net", () => ({
  createServer: vi.fn(() => ({
    listen: vi.fn((_port: number, cb?: () => void) => { if (cb) cb(); }),
    close: vi.fn(),
  })),
}));

const mockedFs = vi.mocked(fs, true);

// ─── Test data ──────────────────────────────────────────────────────────────

const normalTelemetry: TelemetryData = {
  device_id: "esp32-001",
  temperature_zone1: 210,
  temperature_zone2: 210,
  temperature_zone3: 210,
  motor_speed: 30,
  filament_diameter: 2.85,
  winder_speed: 25,
};

const warningTelemetry: TelemetryData = {
  device_id: "esp32-001",
  temperature_zone1: 220,
  temperature_zone2: 220,
  temperature_zone3: 220,
  motor_speed: 35,
  filament_diameter: 2.79,
  winder_speed: 28,
};

const dangerTelemetry: TelemetryData = {
  device_id: "esp32-001",
  temperature_zone1: 235,
  temperature_zone2: 235,
  temperature_zone3: 235,
  motor_speed: 40,
  filament_diameter: 2.65,
  winder_speed: 30,
};

const fakeClient = { id: "test-esp32-001" };

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getFreshModules() {
  vi.resetModules();

  vi.doMock("fs", () => ({
    default: {
      existsSync: vi.fn().mockReturnValue(false),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
    },
  }));

  vi.doMock("path", async (importOriginal) => {
    const actual = await importOriginal<typeof import("path")>();
    return {
      ...actual,
      default: {
        ...actual,
        join: (...args: string[]) => actual.join(...args),
      },
    };
  });

  vi.doMock("net", () => ({
    createServer: vi.fn(() => ({
      listen: vi.fn((_port: number, cb?: () => void) => { if (cb) cb(); }),
      close: vi.fn(),
    })),
  }));

  const database = await import("../database");
  const mqttHandler = await import("../mqttHandler");
  return { database, mqttHandler };
}

function makePublishPacket(topic: string, payload: unknown) {
  return {
    topic,
    payload: Buffer.from(JSON.stringify(payload)),
    qos: 1 as const,
    retain: false,
    cmd: "publish" as const,
    dup: false,
  };
}

function makeRawPacket(topic: string, rawPayload: string) {
  return {
    topic,
    payload: Buffer.from(rawPayload),
    qos: 1 as const,
    retain: false,
    cmd: "publish" as const,
    dup: false,
  };
}

// ─── Setup / Teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockedFs.existsSync.mockReturnValue(false);
  mockedFs.writeFileSync.mockImplementation(() => {});
  mockedFs.readFileSync.mockImplementation(() => Buffer.alloc(0));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite A: MQTT Telemetry → Database Pipeline (Core Integration)
// ═══════════════════════════════════════════════════════════════════════════

describe("Suite A: MQTT Telemetry → Database Pipeline", () => {
  it("publish valid telemetry JSON → parsed, inserted into DB, retrievable via getRecentTelemetry() with all 7 fields matching", async () => {
    const { database, mqttHandler } = await getFreshModules();
    await database.initDatabase();

    const broadcasts: string[] = [];
    const aedes = mqttHandler.initMqttBroker((data) => broadcasts.push(data));

    aedes.emit("publish", makePublishPacket("greenextrude/telemetry", normalTelemetry), fakeClient);

    const results = database.getRecentTelemetry(1);
    expect(results).toHaveLength(1);

    const row = results[0];
    expect(row.device_id).toBe("esp32-001");
    expect(row.temperature_zone1).toBe(210);
    expect(row.temperature_zone2).toBe(210);
    expect(row.temperature_zone3).toBe(210);
    expect(row.motor_speed).toBe(30);
    expect(row.filament_diameter).toBeCloseTo(2.85);
    expect(row.winder_speed).toBe(25);

    database.closeDatabase();
  });

  it("publish multiple telemetry packets in sequence → all stored in DESC order by id, row count matches", async () => {
    const { database, mqttHandler } = await getFreshModules();
    await database.initDatabase();

    const aedes = mqttHandler.initMqttBroker(() => {});

    const payloads: TelemetryData[] = [
      { ...normalTelemetry, device_id: "esp32-first" },
      { ...warningTelemetry, device_id: "esp32-second" },
      { ...dangerTelemetry, device_id: "esp32-third" },
    ];

    payloads.forEach((p) => {
      aedes.emit("publish", makePublishPacket("greenextrude/telemetry", p), fakeClient);
    });

    const results = database.getRecentTelemetry(10);
    expect(results).toHaveLength(3);
    expect(results[0].device_id).toBe("esp32-third");
    expect(results[1].device_id).toBe("esp32-second");
    expect(results[2].device_id).toBe("esp32-first");

    database.closeDatabase();
  });

  it("publish telemetry with floating-point precision → no precision loss after MQTT → parse → DB → query round-trip", async () => {
    const { database, mqttHandler } = await getFreshModules();
    await database.initDatabase();

    const aedes = mqttHandler.initMqttBroker(() => {});

    const precise: TelemetryData = {
      device_id: "esp32-precise",
      temperature_zone1: 210.123,
      temperature_zone2: 215.456,
      temperature_zone3: 220.789,
      motor_speed: 30.001,
      filament_diameter: 2.847,
      winder_speed: 25.999,
    };

    aedes.emit("publish", makePublishPacket("greenextrude/telemetry", precise), fakeClient);

    const results = database.getRecentTelemetry(1);
    const row = results[0];

    expect(row.temperature_zone1).toBeCloseTo(210.123, 3);
    expect(row.temperature_zone2).toBeCloseTo(215.456, 3);
    expect(row.temperature_zone3).toBeCloseTo(220.789, 3);
    expect(row.motor_speed).toBeCloseTo(30.001, 3);
    expect(row.filament_diameter).toBeCloseTo(2.847, 3);
    expect(row.winder_speed).toBeCloseTo(25.999, 3);

    database.closeDatabase();
  });

  it("publish telemetry with null/missing optional fields → graceful handling (NULL stored, no crash)", async () => {
    const { database, mqttHandler } = await getFreshModules();
    await database.initDatabase();

    const aedes = mqttHandler.initMqttBroker(() => {});

    const partial: TelemetryData = {
      device_id: "esp32-partial",
      temperature_zone1: undefined as any,
      temperature_zone2: undefined as any,
      temperature_zone3: undefined as any,
      motor_speed: undefined as any,
      filament_diameter: undefined as any,
      winder_speed: undefined as any,
    };

    aedes.emit("publish", makePublishPacket("greenextrude/telemetry", partial), fakeClient);

    const results = database.getRecentTelemetry(1);
    expect(results).toHaveLength(1);

    const row = results[0];
    expect(row.device_id).toBe("esp32-partial");
    expect(row.temperature_zone1).toBeNull();
    expect(row.temperature_zone2).toBeNull();
    expect(row.temperature_zone3).toBeNull();
    expect(row.motor_speed).toBeNull();
    expect(row.filament_diameter).toBeNull();
    expect(row.winder_speed).toBeNull();

    database.closeDatabase();
  });

  it("WebSocket broadcast receives telemetry with correct WsMessage structure and matching payload", async () => {
    const { database, mqttHandler } = await getFreshModules();
    await database.initDatabase();

    const broadcasts: string[] = [];
    const aedes = mqttHandler.initMqttBroker((data) => broadcasts.push(data));

    aedes.emit("publish", makePublishPacket("greenextrude/telemetry", normalTelemetry), fakeClient);

    expect(broadcasts).toHaveLength(1);

    const parsed: WsMessage<TelemetryData> = JSON.parse(broadcasts[0]);
    expect(parsed.type).toBe("telemetry");
    expect(parsed.payload.device_id).toBe("esp32-001");
    expect(parsed.payload.temperature_zone1).toBe(210);
    expect(parsed.payload.temperature_zone2).toBe(210);
    expect(parsed.payload.temperature_zone3).toBe(210);
    expect(parsed.payload.motor_speed).toBe(30);
    expect(parsed.payload.filament_diameter).toBeCloseTo(2.85);
    expect(parsed.payload.winder_speed).toBe(25);

    database.closeDatabase();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite B: MQTT JSON Parsing & Error Handling
// ═══════════════════════════════════════════════════════════════════════════

describe("Suite B: MQTT JSON Parsing & Error Handling", () => {
  it("publish malformed JSON to telemetry topic → broker does NOT crash, no corrupted DB insert", async () => {
    const { database, mqttHandler } = await getFreshModules();
    await database.initDatabase();

    const broadcasts: string[] = [];
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const aedes = mqttHandler.initMqttBroker((data) => broadcasts.push(data));

    aedes.emit("publish", makeRawPacket("greenextrude/telemetry", "{not valid json!!!"), fakeClient);

    const results = database.getRecentTelemetry(10);
    expect(results).toHaveLength(0);
    expect(broadcasts).toHaveLength(0);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
    database.closeDatabase();
  });

  it("publish valid JSON with wrong data types (string instead of number) → stored as-is without crash", async () => {
    const { database, mqttHandler } = await getFreshModules();
    await database.initDatabase();

    const broadcasts: string[] = [];
    const aedes = mqttHandler.initMqttBroker((data) => broadcasts.push(data));

    const badTypes = {
      device_id: "esp32-badtypes",
      temperature_zone1: "hot",
      temperature_zone2: "hot",
      temperature_zone3: "hot",
      motor_speed: "fast",
      filament_diameter: "thick",
      winder_speed: "fast",
    };

    aedes.emit("publish", makeRawPacket("greenextrude/telemetry", JSON.stringify(badTypes)), fakeClient);

    const results = database.getRecentTelemetry(10);
    expect(results).toHaveLength(1);

    database.closeDatabase();
  });

  it("publish empty payload to telemetry topic → does NOT crash", async () => {
    const { database, mqttHandler } = await getFreshModules();
    await database.initDatabase();

    const broadcasts: string[] = [];
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const aedes = mqttHandler.initMqttBroker((data) => broadcasts.push(data));

    aedes.emit("publish", makeRawPacket("greenextrude/telemetry", ""), fakeClient);

    expect(broadcasts).toHaveLength(0);

    const results = database.getRecentTelemetry(10);
    expect(results).toHaveLength(0);

    consoleErrorSpy.mockRestore();
    database.closeDatabase();
  });

  it("publish with no client (e.g. $SYS message) → ignored (no DB insert, no broadcast)", async () => {
    const { database, mqttHandler } = await getFreshModules();
    await database.initDatabase();

    const broadcasts: string[] = [];
    const aedes = mqttHandler.initMqttBroker((data) => broadcasts.push(data));

    const packet = {
      topic: "greenextrude/telemetry",
      payload: Buffer.from(JSON.stringify(normalTelemetry)),
      qos: 1 as const,
      retain: false,
      cmd: "publish" as const,
      dup: false,
    };

    aedes.emit("publish", packet, null);

    const results = database.getRecentTelemetry(10);
    expect(results).toHaveLength(0);
    expect(broadcasts).toHaveLength(0);

    database.closeDatabase();
  });

  it("publish to unknown topic → ignored (no DB insert, no broadcast)", async () => {
    const { database, mqttHandler } = await getFreshModules();
    await database.initDatabase();

    const broadcasts: string[] = [];
    const aedes = mqttHandler.initMqttBroker((data) => broadcasts.push(data));

    aedes.emit(
      "publish",
      makePublishPacket("greenextrude/unknown_topic", normalTelemetry),
      fakeClient,
    );

    const results = database.getRecentTelemetry(10);
    expect(results).toHaveLength(0);
    expect(broadcasts).toHaveLength(0);

    database.closeDatabase();
  });

  it("publish telemetry with partial data (only 2 of 3 temperature zones) → stores available fields as NULL for missing", async () => {
    const { database, mqttHandler } = await getFreshModules();
    await database.initDatabase();

    const aedes = mqttHandler.initMqttBroker(() => {});

    const partial: TelemetryData = {
      device_id: "esp32-twozones",
      temperature_zone1: 210,
      temperature_zone2: 215,
      temperature_zone3: undefined as any,
      motor_speed: 30,
      filament_diameter: 2.85,
      winder_speed: 25,
    };

    aedes.emit("publish", makePublishPacket("greenextrude/telemetry", partial), fakeClient);

    const results = database.getRecentTelemetry(1);
    expect(results).toHaveLength(1);
    expect(results[0].temperature_zone1).toBe(210);
    expect(results[0].temperature_zone2).toBe(215);
    expect(results[0].temperature_zone3).toBeNull();

    database.closeDatabase();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite C: MQTT Client Lifecycle → Device Status
// ═══════════════════════════════════════════════════════════════════════════

describe("Suite C: MQTT Client Lifecycle → Device Status", () => {
  it("MQTT client connects → device_status 'connected' broadcast + getLastDeviceStatus() returns connected", async () => {
    const { database, mqttHandler } = await getFreshModules();
    await database.initDatabase();

    const broadcasts: string[] = [];
    const aedes = mqttHandler.initMqttBroker((data) => broadcasts.push(data));

    aedes.emit("client", fakeClient);

    expect(broadcasts).toHaveLength(1);

    const parsed: WsMessage<DeviceStatusMessage> = JSON.parse(broadcasts[0]);
    expect(parsed.type).toBe("device_status");
    expect(parsed.payload.clientId).toBe("test-esp32-001");
    expect(parsed.payload.status).toBe("connected");

    const status = mqttHandler.getLastDeviceStatus();
    expect(status).not.toBeNull();
    expect(status!.status).toBe("connected");
    expect(status!.clientId).toBe("test-esp32-001");

    database.closeDatabase();
  });

  it("MQTT client disconnects → device_status 'disconnected' broadcast + getLastDeviceStatus() returns disconnected", async () => {
    const { database, mqttHandler } = await getFreshModules();
    await database.initDatabase();

    const broadcasts: string[] = [];
    const aedes = mqttHandler.initMqttBroker((data) => broadcasts.push(data));

    aedes.emit("clientDisconnect", fakeClient);

    expect(broadcasts).toHaveLength(1);

    const parsed: WsMessage<DeviceStatusMessage> = JSON.parse(broadcasts[0]);
    expect(parsed.type).toBe("device_status");
    expect(parsed.payload.status).toBe("disconnected");
    expect(parsed.payload.clientId).toBe("test-esp32-001");

    const status = mqttHandler.getLastDeviceStatus();
    expect(status!.status).toBe("disconnected");

    database.closeDatabase();
  });

  it("multiple client connect/disconnect cycles → lastDeviceStatus always reflects most recent event", async () => {
    const { database, mqttHandler } = await getFreshModules();
    await database.initDatabase();

    const aedes = mqttHandler.initMqttBroker(() => {});

    const client1 = { id: "device-alpha" };
    const client2 = { id: "device-beta" };

    aedes.emit("client", client1);
    expect(mqttHandler.getLastDeviceStatus()!.status).toBe("connected");
    expect(mqttHandler.getLastDeviceStatus()!.clientId).toBe("device-alpha");

    aedes.emit("client", client2);
    expect(mqttHandler.getLastDeviceStatus()!.status).toBe("connected");
    expect(mqttHandler.getLastDeviceStatus()!.clientId).toBe("device-beta");

    aedes.emit("clientDisconnect", client1);
    expect(mqttHandler.getLastDeviceStatus()!.status).toBe("disconnected");
    expect(mqttHandler.getLastDeviceStatus()!.clientId).toBe("device-alpha");

    aedes.emit("client", client1);
    expect(mqttHandler.getLastDeviceStatus()!.status).toBe("connected");
    expect(mqttHandler.getLastDeviceStatus()!.clientId).toBe("device-alpha");

    database.closeDatabase();
  });

  it("publish to 'greenextrude/status' topic → broadcast as device_status to WebSocket clients", async () => {
    const { database, mqttHandler } = await getFreshModules();
    await database.initDatabase();

    const broadcasts: string[] = [];
    const aedes = mqttHandler.initMqttBroker((data) => broadcasts.push(data));

    aedes.emit(
      "publish",
      makeRawPacket("greenextrude/status", "device running OK"),
      fakeClient,
    );

    expect(broadcasts).toHaveLength(1);

    const parsed: WsMessage<DeviceStatusMessage> = JSON.parse(broadcasts[0]);
    expect(parsed.type).toBe("device_status");
    expect(parsed.payload.status).toBe("connected");
    expect(parsed.payload.message).toBe("device running OK");
    expect(parsed.payload.clientId).toBe("test-esp32-001");

    database.closeDatabase();
  });

  it("publish to 'greenextrude/status' with client missing id → defaults clientId to 'unknown'", async () => {
    const { database, mqttHandler } = await getFreshModules();
    await database.initDatabase();

    const broadcasts: string[] = [];
    const aedes = mqttHandler.initMqttBroker((data) => broadcasts.push(data));

    aedes.emit(
      "publish",
      makeRawPacket("greenextrude/status", "sensor alert"),
      {},
    );

    expect(broadcasts).toHaveLength(1);

    const parsed: WsMessage<DeviceStatusMessage> = JSON.parse(broadcasts[0]);
    expect(parsed.type).toBe("device_status");
    expect(parsed.payload.clientId).toBe("unknown");
    expect(parsed.payload.message).toBe("sensor alert");

    database.closeDatabase();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite D: MQTT Command → Device (sendCommand)
// ═══════════════════════════════════════════════════════════════════════════

describe("Suite D: MQTT Command → Device (sendCommand)", () => {
  it("send EMERGENCY_STOP command → Aedes publishes to 'greenextrude/command' with correct payload", async () => {
    const { database, mqttHandler } = await getFreshModules();
    await database.initDatabase();

    const aedes = mqttHandler.initMqttBroker(() => {});
    const publishSpy = vi.spyOn(aedes, "publish");

    const cmd: DeviceCommand = { type: "EMERGENCY_STOP" };
    mqttHandler.sendCommand(cmd);

    expect(publishSpy).toHaveBeenCalledTimes(1);

    const [packet] = publishSpy.mock.calls[0];
    expect(packet.topic).toBe("greenextrude/command");

    const payload: DeviceCommand = JSON.parse(packet.payload.toString());
    expect(payload.type).toBe("EMERGENCY_STOP");

    publishSpy.mockRestore();
    database.closeDatabase();
  });

  it("send SET_TEMPERATURE command with zone and value → payload contains { type, zone, value }", async () => {
    const { database, mqttHandler } = await getFreshModules();
    await database.initDatabase();

    const aedes = mqttHandler.initMqttBroker(() => {});
    const publishSpy = vi.spyOn(aedes, "publish");

    const cmd: DeviceCommand = { type: "SET_TEMPERATURE", zone: 2, value: 210 };
    mqttHandler.sendCommand(cmd);

    const [packet] = publishSpy.mock.calls[0];
    const payload: DeviceCommand = JSON.parse(packet.payload.toString());
    expect(payload.type).toBe("SET_TEMPERATURE");
    expect(payload.zone).toBe(2);
    expect(payload.value).toBe(210);

    publishSpy.mockRestore();
    database.closeDatabase();
  });

  it("send START command → correct topic and payload", async () => {
    const { database, mqttHandler } = await getFreshModules();
    await database.initDatabase();

    const aedes = mqttHandler.initMqttBroker(() => {});
    const publishSpy = vi.spyOn(aedes, "publish");

    const cmd: DeviceCommand = { type: "START" };
    mqttHandler.sendCommand(cmd);

    const [packet] = publishSpy.mock.calls[0];
    expect(packet.topic).toBe("greenextrude/command");

    const payload: DeviceCommand = JSON.parse(packet.payload.toString());
    expect(payload.type).toBe("START");

    publishSpy.mockRestore();
    database.closeDatabase();
  });

  it("send command when broker is NOT initialized → does NOT crash (early return)", async () => {
    const { mqttHandler } = await getFreshModules();

    const cmd: DeviceCommand = { type: "EMERGENCY_STOP" };
    expect(() => mqttHandler.sendCommand(cmd)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suite E: Full End-to-End Integration Scenario
// ═══════════════════════════════════════════════════════════════════════════

describe("Suite E: Full End-to-End Integration Scenario", () => {
  it("simulate complete production cycle: connect → 5 telemetry packets (normal→warning→danger) → disconnect → verify all data", async () => {
    const { database, mqttHandler } = await getFreshModules();
    await database.initDatabase();

    const broadcasts: string[] = [];
    const aedes = mqttHandler.initMqttBroker((data) => broadcasts.push(data));

    // Step 1: Simulate MQTT client connect
    aedes.emit("client", fakeClient);

    const connectBroadcast = JSON.parse(broadcasts.shift()!);
    expect(connectBroadcast.type).toBe("device_status");
    expect(connectBroadcast.payload.status).toBe("connected");

    // Step 2: Publish 5 telemetry packets — normal → warning → danger
    const telemetrySequence: TelemetryData[] = [
      { ...normalTelemetry, device_id: "esp32-001" },
      { ...normalTelemetry, device_id: "esp32-001", motor_speed: 31 },
      { ...warningTelemetry, device_id: "esp32-001" },
      { ...warningTelemetry, device_id: "esp32-001", temperature_zone1: 225 },
      { ...dangerTelemetry, device_id: "esp32-001" },
    ];

    telemetrySequence.forEach((t) => {
      aedes.emit("publish", makePublishPacket("greenextrude/telemetry", t), fakeClient);
    });

    // Step 3: Verify all 5 stored in DB in correct order (DESC by id)
    const results = database.getRecentTelemetry(10);
    expect(results).toHaveLength(5);
    expect(results[0].temperature_zone1).toBe(235);
    expect(results[4].temperature_zone1).toBe(210);

    // Step 4: Verify WebSocket broadcasts received for each telemetry packet
    expect(broadcasts).toHaveLength(5);
    broadcasts.forEach((b) => {
      const parsed: WsMessage<TelemetryData> = JSON.parse(b);
      expect(parsed.type).toBe("telemetry");
    });
    broadcasts.length = 0;

    // Step 5: Simulate MQTT client disconnect
    aedes.emit("clientDisconnect", fakeClient);

    expect(broadcasts).toHaveLength(1);
    const disconnectBroadcast = JSON.parse(broadcasts[0]);
    expect(disconnectBroadcast.type).toBe("device_status");
    expect(disconnectBroadcast.payload.status).toBe("disconnected");

    // Step 6: Verify getLastDeviceStatus reflects disconnect
    expect(mqttHandler.getLastDeviceStatus()!.status).toBe("disconnected");

    // Step 7: Query DB and verify data integrity — all values match originals
    const finalResults = database.getRecentTelemetry(5);
    expect(finalResults[0].device_id).toBe("esp32-001");
    expect(finalResults[0].temperature_zone1).toBe(235);
    expect(finalResults[0].filament_diameter).toBeCloseTo(2.65);
    expect(finalResults[4].temperature_zone1).toBe(210);
    expect(finalResults[4].filament_diameter).toBeCloseTo(2.85);

    // Step 8: Close database cleanly
    database.closeDatabase();
  });

  it("simulate high-throughput: publish 50 telemetry packets rapidly → all 50 stored, no data loss, correct order", async () => {
    const { database, mqttHandler } = await getFreshModules();
    await database.initDatabase();

    const broadcasts: string[] = [];
    const aedes = mqttHandler.initMqttBroker((data) => broadcasts.push(data));

    const COUNT = 50;

    for (let i = 0; i < COUNT; i++) {
      const packet: TelemetryData = {
        device_id: `esp32-bulk-${i}`,
        temperature_zone1: 200 + i * 0.1,
        temperature_zone2: 200 + i * 0.2,
        temperature_zone3: 200 + i * 0.3,
        motor_speed: 30 + i,
        filament_diameter: 2.85 - i * 0.001,
        winder_speed: 25 + i,
      };
      aedes.emit("publish", makePublishPacket("greenextrude/telemetry", packet), fakeClient);
    }

    const results = database.getRecentTelemetry(COUNT);
    expect(results).toHaveLength(COUNT);

    // Verify newest first (last inserted = id 50 = esp32-bulk-49)
    expect(results[0].device_id).toBe("esp32-bulk-49");
    expect(results[COUNT - 1].device_id).toBe("esp32-bulk-0");

    // Verify no race conditions — count matches exactly
    expect(broadcasts).toHaveLength(COUNT);

    // Spot-check data integrity on first, middle, and last
    expect(results[0].temperature_zone1).toBeCloseTo(200 + 49 * 0.1, 1);
    expect(results[24].device_id).toBe("esp32-bulk-25");
    expect(results[COUNT - 1].temperature_zone1).toBeCloseTo(200, 1);

    database.closeDatabase();
  });
});
