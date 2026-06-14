import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import { TelemetryData } from "../../../shared/types";

// cd server
// npm test             
// npm run test:watch  

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

const mockedFs = vi.mocked(fs, true);

const normalData: TelemetryData = {
  device_id: "esp32-001",
  heater_1: 210,
  heater_2: 210,
  screw_motor_speed: 30,
  filament_diameter: 2.85,
  spool_motor_speed: 25,
};

const warningData: TelemetryData = {
  device_id: "esp32-002",
  heater_1: 220,
  heater_2: 220,
  screw_motor_speed: 35,
  filament_diameter: 2.79,
  spool_motor_speed: 28,
};

const dangerData: TelemetryData = {
  device_id: "esp32-003",
  heater_1: 235,
  heater_2: 235,
  screw_motor_speed: 40,
  filament_diameter: 2.65,
  spool_motor_speed: 30,
};

const edgeData: TelemetryData = {
  device_id: "esp32-000",
  heater_1: 0,
  heater_2: 0,
  screw_motor_speed: 0,
  filament_diameter: 0,
  spool_motor_speed: 0,
};

async function getFreshModule() {
  vi.resetModules();
  const mod = await import("../database");
  return mod;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedFs.existsSync.mockReturnValue(false);
  mockedFs.writeFileSync.mockImplementation(() => {});
  mockedFs.readFileSync.mockImplementation(() => Buffer.alloc(0));
});

describe("initDatabase()", () => {
  it("creates an in-memory database and returns it", async () => {
    const { initDatabase } = await getFreshModule();

    const db = await initDatabase();

    expect(db).toBeDefined();
    expect(typeof db.run).toBe("function");
  });

  it("creates the telemetry table with the correct schema", async () => {
    const { initDatabase } = await getFreshModule();
    const db = await initDatabase();

    const stmt = db.prepare("PRAGMA table_info(telemetry)");
    const columns: { name: string; type: string; notnull: number; pk: number }[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      columns.push({
        name: row.name,
        type: row.type,
        notnull: row.notnull,
        pk: row.pk,
      });
    }
    stmt.free();

    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain("id");
    expect(columnNames).toContain("timestamp");
    expect(columnNames).toContain("heater_1");
    expect(columnNames).toContain("heater_2");
    expect(columnNames).toContain("screw_motor_speed");
    expect(columnNames).toContain("filament_diameter");
    expect(columnNames).toContain("spool_motor_speed");
    expect(columnNames).toContain("device_id");

    const idCol = columns.find((c) => c.name === "id")!;
    expect(idCol.type).toBe("INTEGER");
    expect(idCol.pk).toBe(1);

    const tsCol = columns.find((c) => c.name === "timestamp")!;
    expect(tsCol.type).toBe("TEXT");
    expect(tsCol.notnull).toBe(1);

    const h1Col = columns.find((c) => c.name === "heater_1")!;
    expect(h1Col.type).toBe("REAL");

    const didCol = columns.find((c) => c.name === "device_id")!;
    expect(didCol.type).toBe("TEXT");
  });

  it("makes the telemetry table queryable after initialization", async () => {
    const { initDatabase } = await getFreshModule();
    const db = await initDatabase();

    const stmt = db.prepare("SELECT COUNT(*) as cnt FROM telemetry");
    stmt.step();
    const row = stmt.getAsObject() as any;
    expect(row.cnt).toBe(0);
    stmt.free();
  });

  it("is idempotent — calling twice does not throw and table remains queryable", async () => {
    const mod = await getFreshModule();
    await mod.initDatabase();

    await expect(mod.initDatabase()).resolves.toBeDefined();

    const db = await mod.initDatabase();
    const stmt = db.prepare("SELECT COUNT(*) as cnt FROM telemetry");
    stmt.step();
    const row = stmt.getAsObject() as any;
    expect(row.cnt).toBe(0);
    stmt.free();
  });

  it("loads an existing database when DB file exists", async () => {
    const mod1 = await getFreshModule();
    const db1 = await mod1.initDatabase();
    mod1.insertTelemetry(normalData);

    const exported = db1.export();
    const buffer = Buffer.from(exported);
    mod1.closeDatabase();

    vi.resetModules();
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(buffer);

    const mod2 = await getFreshModule();
    await mod2.initDatabase();

    const results = mod2.getRecentTelemetry();
    expect(results).toHaveLength(1);
    expect(results[0].device_id).toBe("esp32-001");
    mod2.closeDatabase();
  });
});

describe("insertTelemetry()", () => {
  it("inserts a valid TelemetryData record with all fields populated", async () => {
    const { initDatabase, insertTelemetry } = await getFreshModule();
    const db = await initDatabase();

    insertTelemetry(normalData);

    const stmt = db.prepare("SELECT * FROM telemetry");
    stmt.step();
    const row = stmt.getAsObject() as any;
    stmt.free();

    expect(row.device_id).toBe("esp32-001");
    expect(row.heater_1).toBe(210);
    expect(row.heater_2).toBe(210);
    expect(row.screw_motor_speed).toBe(30);
    expect(row.filament_diameter).toBe(2.85);
    expect(row.spool_motor_speed).toBe(25);
  });

  it("verifies the inserted row is retrievable via raw SQL SELECT", async () => {
    const { initDatabase, insertTelemetry } = await getFreshModule();
    const db = await initDatabase();

    insertTelemetry(normalData);

    const stmt = db.prepare("SELECT device_id FROM telemetry WHERE device_id = ?");
    stmt.bind(["esp32-001"]);
    expect(stmt.step()).toBe(true);
    const row = stmt.getAsObject() as any;
    expect(row.device_id).toBe("esp32-001");
    stmt.free();
  });

  it("handles null/undefined sensor values gracefully (stores NULL via ?? null)", async () => {
    const { initDatabase, insertTelemetry } = await getFreshModule();
    const db = await initDatabase();

    const partialData: TelemetryData = {
      device_id: "esp32-partial",
      heater_1: undefined as any,
      heater_2: undefined as any,
      screw_motor_speed: undefined as any,
      filament_diameter: undefined as any,
      spool_motor_speed: undefined as any,
    };

    insertTelemetry(partialData);

    const stmt = db.prepare("SELECT * FROM telemetry");
    stmt.step();
    const row = stmt.getAsObject() as any;
    stmt.free();

    expect(row.heater_1).toBeNull();
    expect(row.heater_2).toBeNull();
    expect(row.screw_motor_speed).toBeNull();
    expect(row.filament_diameter).toBeNull();
    expect(row.spool_motor_speed).toBeNull();
  });

  it("inserts multiple records and verifies row count matches", async () => {
    const { initDatabase, insertTelemetry } = await getFreshModule();
    const db = await initDatabase();

    [normalData, warningData, dangerData].forEach((r) => insertTelemetry(r));

    const stmt = db.prepare("SELECT COUNT(*) as cnt FROM telemetry");
    stmt.step();
    const row = stmt.getAsObject() as any;
    expect(row.cnt).toBe(3);
    stmt.free();
  });

  it("stores floating-point values without precision loss", async () => {
    const { initDatabase, insertTelemetry } = await getFreshModule();
    const db = await initDatabase();

    const preciseData: TelemetryData = {
      device_id: "esp32-precise",
      heater_1: 210.123,
      heater_2: 215.456,
      screw_motor_speed: 30.001,
      filament_diameter: 2.847,
      spool_motor_speed: 25.999,
    };

    insertTelemetry(preciseData);

    const stmt = db.prepare("SELECT * FROM telemetry");
    stmt.step();
    const row = stmt.getAsObject() as any;
    stmt.free();

    expect(row.heater_1).toBeCloseTo(210.123, 3);
    expect(row.heater_2).toBeCloseTo(215.456, 3);
    expect(row.screw_motor_speed).toBeCloseTo(30.001, 3);
    expect(row.filament_diameter).toBeCloseTo(2.847, 3);
    expect(row.spool_motor_speed).toBeCloseTo(25.999, 3);
  });

  it("defaults device_id to 'unknown' when not provided", async () => {
    const { initDatabase, insertTelemetry } = await getFreshModule();
    const db = await initDatabase();

    const noDeviceData: TelemetryData = {
      device_id: undefined as any,
      heater_1: 210,
      heater_2: 210,
      screw_motor_speed: 30,
      filament_diameter: 2.85,
      spool_motor_speed: 25,
    };

    insertTelemetry(noDeviceData);

    const stmt = db.prepare("SELECT device_id FROM telemetry");
    stmt.step();
    const row = stmt.getAsObject() as any;
    stmt.free();

    expect(row.device_id).toBe("unknown");
  });

  it("persists to disk via writeFileSync after every insert", async () => {
    const { initDatabase, insertTelemetry } = await getFreshModule();
    await initDatabase();

    mockedFs.writeFileSync.mockClear();
    insertTelemetry(normalData);

    expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(1);
  });
});

describe("getRecentTelemetry()", () => {
  it("returns an empty array when the database has no records", async () => {
    const { initDatabase, getRecentTelemetry } = await getFreshModule();
    await initDatabase();

    const results = getRecentTelemetry();
    expect(results).toEqual([]);
  });

  it("returns all records when limit >= total rows", async () => {
    const { initDatabase, insertTelemetry, getRecentTelemetry } = await getFreshModule();
    await initDatabase();

    [normalData, warningData, dangerData].forEach((r) => insertTelemetry(r));

    const results = getRecentTelemetry(100);
    expect(results).toHaveLength(3);
  });

  it("respects the limit parameter (insert 10, request 5 → get 5)", async () => {
    const { initDatabase, insertTelemetry, getRecentTelemetry } = await getFreshModule();
    await initDatabase();

    for (let i = 0; i < 10; i++) {
      insertTelemetry({ ...normalData, device_id: `esp32-${i}` });
    }

    const results = getRecentTelemetry(5);
    expect(results).toHaveLength(5);
  });

  it("returns records in DESC order (newest first by id)", async () => {
    const { initDatabase, insertTelemetry, getRecentTelemetry } = await getFreshModule();
    await initDatabase();

    insertTelemetry({ ...normalData, device_id: "first" });
    insertTelemetry({ ...normalData, device_id: "second" });
    insertTelemetry({ ...normalData, device_id: "third" });

    const results = getRecentTelemetry(10);
    expect(results[0].device_id).toBe("third");
    expect(results[1].device_id).toBe("second");
    expect(results[2].device_id).toBe("first");
  });

  it("maps all columns correctly to the TelemetryData interface", async () => {
    const { initDatabase, insertTelemetry, getRecentTelemetry } = await getFreshModule();
    await initDatabase();

    insertTelemetry(normalData);

    const results = getRecentTelemetry(1);
    const record = results[0];

    expect(record).toHaveProperty("device_id");
    expect(record).toHaveProperty("heater_1");
    expect(record).toHaveProperty("heater_2");
    expect(record).toHaveProperty("screw_motor_speed");
    expect(record).toHaveProperty("filament_diameter");
    expect(record).toHaveProperty("spool_motor_speed");
    expect(record).toHaveProperty("timestamp");

    expect(record.device_id).toBe("esp32-001");
    expect(record.heater_1).toBe(210);
    expect(record.heater_2).toBe(210);
    expect(record.screw_motor_speed).toBe(30);
    expect(record.filament_diameter).toBe(2.85);
    expect(record.spool_motor_speed).toBe(25);
  });

  it("populates timestamp as a valid ISO-like datetime string", async () => {
    const { initDatabase, insertTelemetry, getRecentTelemetry } = await getFreshModule();
    await initDatabase();

    insertTelemetry(normalData);

    const results = getRecentTelemetry(1);
    const timestamp = results[0].timestamp;

    expect(timestamp).toBeDefined();
    expect(typeof timestamp).toBe("string");
    expect(timestamp!.length).toBeGreaterThan(0);
    const parsed = new Date(timestamp!.replace(" ", "T") + "Z");
    expect(parsed.toString()).not.toBe("Invalid Date");
  });

  it("defaults limit to 100 when no argument is provided", async () => {
    const { initDatabase, insertTelemetry, getRecentTelemetry } = await getFreshModule();
    await initDatabase();

    for (let i = 0; i < 150; i++) {
      insertTelemetry({ ...normalData, device_id: `esp32-${i}` });
    }

    const results = getRecentTelemetry();
    expect(results).toHaveLength(100);
  });
});

describe("Edge Cases & Data Integrity", () => {
  it("inserting extreme values (temp=999, diameter=0.01) does not crash", async () => {
    const { initDatabase, insertTelemetry, getRecentTelemetry } = await getFreshModule();
    await initDatabase();

    const extremeData: TelemetryData = {
      device_id: "esp32-extreme",
      heater_1: 999,
      heater_2: 999,
      screw_motor_speed: 999,
      filament_diameter: 0.01,
      spool_motor_speed: 999,
    };

    expect(() => insertTelemetry(extremeData)).not.toThrow();

    const results = getRecentTelemetry(1);
    expect(results[0].heater_1).toBe(999);
    expect(results[0].filament_diameter).toBeCloseTo(0.01);
  });

  it("inserting negative values does not corrupt the database", async () => {
    const { initDatabase, insertTelemetry, getRecentTelemetry } = await getFreshModule();
    await initDatabase();

    const negativeData: TelemetryData = {
      device_id: "esp32-negative",
      heater_1: -40,
      heater_2: -40,
      screw_motor_speed: -10,
      filament_diameter: -1.5,
      spool_motor_speed: -5,
    };

    expect(() => insertTelemetry(negativeData)).not.toThrow();

    const results = getRecentTelemetry(1);
    expect(results[0].heater_1).toBe(-40);
    expect(results[0].screw_motor_speed).toBe(-10);
    expect(results[0].filament_diameter).toBe(-1.5);
  });

  it("rapid successive inserts (100 in a loop) all persist correctly", async () => {
    const { initDatabase, insertTelemetry, getRecentTelemetry } = await getFreshModule();
    const db = await initDatabase();

    for (let i = 0; i < 100; i++) {
      insertTelemetry({
        ...normalData,
        device_id: `esp32-bulk-${i}`,
        heater_1: 200 + i * 0.1,
      });
    }

    const stmt = db.prepare("SELECT COUNT(*) as cnt FROM telemetry");
    stmt.step();
    const row = stmt.getAsObject() as any;
    expect(row.cnt).toBe(100);
    stmt.free();
  });

  it("getRecentTelemetry after bulk insert returns correct count and order", async () => {
    const { initDatabase, insertTelemetry, getRecentTelemetry } = await getFreshModule();
    await initDatabase();

    for (let i = 0; i < 50; i++) {
      insertTelemetry({ ...normalData, device_id: `esp32-seq-${i}` });
    }

    const results = getRecentTelemetry(100);
    expect(results).toHaveLength(50);
    expect(results[0].device_id).toBe("esp32-seq-49");
    expect(results[49].device_id).toBe("esp32-seq-0");
  });

  it("preserves data types: numbers stay numbers, strings stay strings", async () => {
    const { initDatabase, insertTelemetry, getRecentTelemetry } = await getFreshModule();
    await initDatabase();

    insertTelemetry(normalData);

    const results = getRecentTelemetry(1);
    const record = results[0];

    expect(typeof record.device_id).toBe("string");
    expect(typeof record.heater_1).toBe("number");
    expect(typeof record.heater_2).toBe("number");
    expect(typeof record.screw_motor_speed).toBe("number");
    expect(typeof record.filament_diameter).toBe("number");
    expect(typeof record.spool_motor_speed).toBe("number");
    expect(typeof record.timestamp).toBe("string");
  });

  it("inserting zero values stores actual zeros, not NULL", async () => {
    const { initDatabase, insertTelemetry, getRecentTelemetry } = await getFreshModule();
    await initDatabase();

    insertTelemetry(edgeData);

    const results = getRecentTelemetry(1);
    const record = results[0];

    expect(record.heater_1).toBe(0);
    expect(record.heater_2).toBe(0);
    expect(record.screw_motor_speed).toBe(0);
    expect(record.filament_diameter).toBe(0);
    expect(record.spool_motor_speed).toBe(0);
  });

  it("auto-incrementing id is unique across inserts", async () => {
    const { initDatabase, insertTelemetry } = await getFreshModule();
    const db = await initDatabase();

    insertTelemetry(normalData);
    insertTelemetry(warningData);

    const stmt = db.prepare("SELECT id FROM telemetry ORDER BY id");
    const ids: number[] = [];
    while (stmt.step()) {
      ids.push((stmt.getAsObject() as any).id);
    }
    stmt.free();

    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[1]).toBeGreaterThan(ids[0]);
  });

  it("handles warning-level sensor values correctly", async () => {
    const { initDatabase, insertTelemetry, getRecentTelemetry } = await getFreshModule();
    await initDatabase();

    insertTelemetry(warningData);

    const results = getRecentTelemetry(1);
    const record = results[0];

    expect(record.heater_1).toBe(220);
    expect(record.filament_diameter).toBeCloseTo(2.79);
  });

  it("handles danger-level sensor values correctly", async () => {
    const { initDatabase, insertTelemetry, getRecentTelemetry } = await getFreshModule();
    await initDatabase();

    insertTelemetry(dangerData);

    const results = getRecentTelemetry(1);
    const record = results[0];

    expect(record.heater_1).toBe(235);
    expect(record.filament_diameter).toBeCloseTo(2.65);
  });
});

describe("closeDatabase()", () => {
  it("does not throw when closing a valid database", async () => {
    const { initDatabase, closeDatabase } = await getFreshModule();
    await initDatabase();

    expect(() => closeDatabase()).not.toThrow();
  });

  it("persists data to disk via writeFileSync before closing", async () => {
    const { initDatabase, closeDatabase } = await getFreshModule();
    await initDatabase();

    mockedFs.writeFileSync.mockClear();
    closeDatabase();

    expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(1);
  });

  it("does not throw when called on an uninitialized database (db is undefined)", async () => {
    const { closeDatabase } = await getFreshModule();

    expect(() => closeDatabase()).not.toThrow();
  });

  it("does not call writeFileSync when db is undefined", async () => {
    const { closeDatabase } = await getFreshModule();
    mockedFs.writeFileSync.mockClear();

    closeDatabase();

    expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
  });
});

describe("Integration: initDatabase → insertTelemetry → getRecentTelemetry", () => {
  it("end-to-end flow: init, insert, query yields correct data", async () => {
    const { initDatabase, insertTelemetry, getRecentTelemetry } = await getFreshModule();
    await initDatabase();

    insertTelemetry(normalData);
    insertTelemetry(warningData);
    insertTelemetry(dangerData);

    const results = getRecentTelemetry(10);

    expect(results).toHaveLength(3);
    expect(results[0].device_id).toBe("esp32-003");
    expect(results[1].device_id).toBe("esp32-002");
    expect(results[2].device_id).toBe("esp32-001");

    expect(results[2].heater_1).toBe(210);
    expect(results[1].heater_1).toBe(220);
    expect(results[0].heater_1).toBe(235);
  });

  it("writeFileSync is called once per insert plus once on close", async () => {
    const { initDatabase, insertTelemetry, closeDatabase } = await getFreshModule();
    await initDatabase();

    mockedFs.writeFileSync.mockClear();
    insertTelemetry(normalData);
    insertTelemetry(warningData);
    closeDatabase();

    expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(3);
  });
});
