/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — Server WebSocket Integration Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests the WebSocket server behavior: connection handshake, history delivery,
 * command relay, broadcast, and multi-client scenarios.
 *
 * Covered:
 *   WS-01..11 (connection, history, commands, broadcast)
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { WebSocketServer, WebSocket } from "ws";
import { initDatabase, closeDatabase, insertTelemetry, getRecentTelemetry } from "../database";
import { initMqttBroker, closeMqttBroker, sendCommand, getLastDeviceStatus } from "../mqttHandler";
import type { TelemetryData, WsMessage, DeviceCommand, DeviceStatusMessage } from "../../../shared/types";

// ─── Dynamic port allocation ────────────────────────────────────────────────
const PORT_BASE = 19000;
let portCounter = 0;
function nextPort(): number {
  return PORT_BASE + portCounter++;
}

// ─── Test Data Factory ──────────────────────────────────────────────────────

function makeTelemetry(overrides: Partial<TelemetryData> = {}): TelemetryData {
  return {
    device_id: "esp32-ws-test",
    heater_1: 200,
    heater_2: 210,
    screw_motor_speed: 30,
    filament_diameter: 2.85,
    spool_motor_speed: 25,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ─── WebSocket Helpers ──────────────────────────────────────────────────────

/**
 * Connects and returns { ws, firstMessage }.
 * We capture the very first message (history) inside the open handler
 * to avoid the race where the server sends history before the caller
 * has a chance to attach a listener.
 */
function connectAndReceive(port: number, timeout = 5000): Promise<{ ws: WebSocket; firstMessage: string }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    let firstMessage: string | null = null;
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("Connect/first-message timeout"));
    }, timeout);

    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    ws.on("open", () => {
      // Connection established, wait for the first message (history)
    });

    ws.on("message", (data) => {
      if (firstMessage === null) {
        firstMessage = data.toString();
        clearTimeout(timer);
        resolve({ ws, firstMessage });
      }
    });
  });
}

function waitForMessage(ws: WebSocket, timeout = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Message timeout")), timeout);
    const handler = (data: Buffer) => {
      clearTimeout(timer);
      ws.off("message", handler);
      resolve(data.toString());
    };
    ws.on("message", handler);
  });
}

function closeWs(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) { resolve(); return; }
    ws.on("close", () => resolve());
    ws.close();
  });
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe("Server WebSocket", () => {
  let wss: WebSocketServer;
  let broadcastFn: (data: string) => void;
  let wsPort: number;
  let mqttPort: number;

  beforeAll(async () => {
    await initDatabase();
  });

  afterAll(() => {
    closeDatabase();
  });

  afterEach(async () => {
    // Close WS server and force-close all connected clients
    if (wss) {
      wss.clients.forEach((c) => c.close());
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    }
    // Close MQTT broker
    await closeMqttBroker();
  });

  /**
   * Creates a fresh WS server on a unique port, mirroring index.ts logic.
   * Waits for the server to be listening before returning.
   */
  const createWSS = async (): Promise<WebSocketServer> => {
    wsPort = nextPort();
    const server = new WebSocketServer({ port: wsPort });
    const clients = new Set<WebSocket>();

    // Wait until the server is actually listening
    await new Promise<void>((resolve) => server.on("listening", resolve));

    server.on("connection", (ws) => {
      clients.add(ws);

      // Send history on connect (mirrors index.ts)
      const history = getRecentTelemetry(100);
      const msg: WsMessage<TelemetryData[]> = { type: "history", payload: history.reverse() };
      ws.send(JSON.stringify(msg));

      // Send last known device status
      const lastStatus = getLastDeviceStatus();
      if (lastStatus) {
        const statusMsg: WsMessage<DeviceStatusMessage> = { type: "device_status", payload: lastStatus };
        ws.send(JSON.stringify(statusMsg));
      }

      // Handle incoming commands
      ws.on("message", (raw: Buffer) => {
        try {
          const parsed = JSON.parse(raw.toString());
          if (parsed.type === "command") {
            sendCommand(parsed.payload as DeviceCommand);
          }
        } catch (err) {
          console.error("[WS-TEST] Bad message:", (err as Error).message);
        }
      });

      ws.on("close", () => clients.delete(ws));
    });

    broadcastFn = (data: string) => {
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      }
    };

    return server;
  };

  // ═══════════════════════════════════════════════════════════════════════
  // Connection Management
  // ═══════════════════════════════════════════════════════════════════════

  describe("Connection Management", () => {
    it("WS-01: client can connect to WebSocket server", async () => {
      wss = await createWSS();
      const { ws, firstMessage } = await connectAndReceive(wsPort);
      expect(ws.readyState).toBe(WebSocket.OPEN);
      // Should have received a history message
      const parsed: WsMessage = JSON.parse(firstMessage);
      expect(parsed.type).toBe("history");
      await closeWs(ws);
    });

    it("WS-02: receives history message on connect", async () => {
      wss = await createWSS();
      const { ws, firstMessage } = await connectAndReceive(wsPort);
      const parsed: WsMessage = JSON.parse(firstMessage);
      expect(parsed.type).toBe("history");
      expect(Array.isArray(parsed.payload)).toBe(true);
      await closeWs(ws);
    });

    it("WS-03: history message contains previously inserted telemetry", async () => {
      insertTelemetry(makeTelemetry({ device_id: "ws-history-test" }));
      wss = await createWSS();
      const { ws, firstMessage } = await connectAndReceive(wsPort);
      const parsed: WsMessage<TelemetryData[]> = JSON.parse(firstMessage);
      expect(parsed.type).toBe("history");
      const found = parsed.payload.some((t) => t.device_id === "ws-history-test");
      expect(found).toBe(true);
      await closeWs(ws);
    });

    it("WS-04: client disconnect and reconnect works", async () => {
      wss = await createWSS();
      const { ws } = await connectAndReceive(wsPort);
      await closeWs(ws);
      // Give it a moment to process the disconnect
      await new Promise((r) => setTimeout(r, 200));
      // Server should still accept new connections on same port
      const { ws: ws2, firstMessage } = await connectAndReceive(wsPort);
      expect(ws2.readyState).toBe(WebSocket.OPEN);
      const parsed: WsMessage = JSON.parse(firstMessage);
      expect(parsed.type).toBe("history");
      await closeWs(ws2);
    });

    it("WS-05: multiple clients can connect simultaneously and each receives history", async () => {
      wss = await createWSS();
      const results = await Promise.all([
        connectAndReceive(wsPort),
        connectAndReceive(wsPort),
        connectAndReceive(wsPort),
      ]);

      for (const { ws, firstMessage } of results) {
        const parsed: WsMessage = JSON.parse(firstMessage);
        expect(parsed.type).toBe("history");
        await closeWs(ws);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Command Relay (WS → MQTT)
  // ═══════════════════════════════════════════════════════════════════════

  describe("Command Relay via WebSocket", () => {
    it("WS-06: sends START command via WS and it reaches MQTT", async () => {
      mqttPort = nextPort();
      const aedes = initMqttBroker(() => {}, mqttPort);
      const publishSpy = vi.spyOn(aedes, "publish");

      wss = await createWSS();
      const { ws } = await connectAndReceive(wsPort);

      ws.send(JSON.stringify({ type: "command", payload: { type: "START" } }));
      await new Promise((r) => setTimeout(r, 300));

      expect(publishSpy).toHaveBeenCalled();
      const call = publishSpy.mock.calls.find((c) => {
        const pkt = c[0];
        return pkt.topic === "greenextrude/command";
      });
      expect(call).toBeDefined();
      const payload: DeviceCommand = JSON.parse(call![0].payload.toString());
      expect(payload.type).toBe("START");

      publishSpy.mockRestore();
      await closeWs(ws);
    });

    it("WS-07: sends EMERGENCY_STOP command via WS", async () => {
      mqttPort = nextPort();
      const aedes = initMqttBroker(() => {}, mqttPort);
      const publishSpy = vi.spyOn(aedes, "publish");

      wss = await createWSS();
      const { ws } = await connectAndReceive(wsPort);

      ws.send(JSON.stringify({ type: "command", payload: { type: "EMERGENCY_STOP" } }));
      await new Promise((r) => setTimeout(r, 300));

      const call = publishSpy.mock.calls.find((c) => c[0].topic === "greenextrude/command");
      expect(call).toBeDefined();
      const payload: DeviceCommand = JSON.parse(call![0].payload.toString());
      expect(payload.type).toBe("EMERGENCY_STOP");

      publishSpy.mockRestore();
      await closeWs(ws);
    });

    it("WS-08: sending invalid JSON does not crash the server", async () => {
      wss = await createWSS();
      const { ws } = await connectAndReceive(wsPort);

      // Should not throw
      ws.send("not a json string");
      await new Promise((r) => setTimeout(r, 200));

      // Connection should still be alive
      expect(ws.readyState).toBe(WebSocket.OPEN);
      await closeWs(ws);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Broadcast (MQTT → WS)
  // ═══════════════════════════════════════════════════════════════════════

  describe("Broadcast from MQTT to WS clients", () => {
    it("WS-09: telemetry broadcast reaches all connected WS clients", async () => {
      wss = await createWSS();
      const results = await Promise.all([
        connectAndReceive(wsPort),
        connectAndReceive(wsPort),
      ]);

      // Simulate broadcast
      const telemetryPayload = makeTelemetry({ device_id: "broadcast-test" });
      const broadcastMsg: WsMessage<TelemetryData> = {
        type: "telemetry",
        payload: telemetryPayload,
      };
      broadcastFn(JSON.stringify(broadcastMsg));

      const msgs = await Promise.all(results.map(({ ws }) => waitForMessage(ws)));
      for (const msg of msgs) {
        const parsed: WsMessage<TelemetryData> = JSON.parse(msg);
        expect(parsed.type).toBe("telemetry");
        expect(parsed.payload.device_id).toBe("broadcast-test");
      }
      for (const { ws } of results) { await closeWs(ws); }
    });

    it("WS-10: device_status broadcast reaches all connected WS clients", async () => {
      wss = await createWSS();
      const results = await Promise.all([
        connectAndReceive(wsPort),
        connectAndReceive(wsPort),
      ]);

      const statusMsg: WsMessage<DeviceStatusMessage> = {
        type: "device_status",
        payload: { clientId: "esp32-broadcast", status: "connected" },
      };
      broadcastFn(JSON.stringify(statusMsg));

      const msgs = await Promise.all(results.map(({ ws }) => waitForMessage(ws)));
      for (const msg of msgs) {
        const parsed: WsMessage<DeviceStatusMessage> = JSON.parse(msg);
        expect(parsed.type).toBe("device_status");
        expect(parsed.payload.status).toBe("connected");
      }
      for (const { ws } of results) { await closeWs(ws); }
    });

    it("WS-11: disconnected client does not receive messages", async () => {
      wss = await createWSS();
      const { ws: ws1 } = await connectAndReceive(wsPort);
      await closeWs(ws1);

      const { ws: ws2 } = await connectAndReceive(wsPort);

      // Broadcast
      broadcastFn(JSON.stringify({ type: "telemetry", payload: makeTelemetry() }));

      // ws2 should get the message
      const msg = await waitForMessage(ws2);
      const parsed: WsMessage = JSON.parse(msg);
      expect(parsed.type).toBe("telemetry");
      await closeWs(ws2);
    });
  });
});

