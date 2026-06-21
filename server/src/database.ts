import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import fs from "fs";
import path from "path";
import { TelemetryData } from "../../shared/types";

const DB_PATH = path.join(__dirname, "..", "greenextrude.db");

let db: SqlJsDatabase;
let hasDiaSettingColumn = false;
let hasFansOnColumn = false;

export async function initDatabase(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();

  // Load existing DB file if it exists
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);

    // Check if schema has old columns (heater_3 indicates old schema)
    const stmt = db.prepare("PRAGMA table_info(telemetry)");
    const columns: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      columns.push(row.name);
    }
    stmt.free();

    // If old schema (has heater_3), recreate the database
    if (columns.includes("heater_3")) {
      console.log("[DB] Detected old schema, recreating database...");
      db.close();
      fs.unlinkSync(DB_PATH);
      db = new SQL.Database();
    } else {
      hasDiaSettingColumn = columns.includes("filament_diameter_setting");
      hasFansOnColumn = columns.includes("fans_on");
    }
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      heater_1 REAL,
      heater_2 REAL,
      screw_motor_speed REAL,
      filament_diameter REAL,
      filament_diameter_setting REAL DEFAULT 2.85,
      fans_on INTEGER DEFAULT 1,
      spool_motor_speed REAL,
      device_id TEXT
    )
  `);

  // Add column if upgrading from old schema
  if (!hasDiaSettingColumn) {
    try {
      db.run("ALTER TABLE telemetry ADD COLUMN filament_diameter_setting REAL DEFAULT 2.85");
      hasDiaSettingColumn = true;
      console.log("[DB] Added filament_diameter_setting column.");
    } catch (e) {
      // Column might already exist
      hasDiaSettingColumn = true;
    }
  }

  if (!hasFansOnColumn) {
    try {
      db.run("ALTER TABLE telemetry ADD COLUMN fans_on INTEGER DEFAULT 1");
      hasFansOnColumn = true;
      console.log("[DB] Added fans_on column.");
    } catch (e) {
      hasFansOnColumn = true;
    }
  }

  console.log("[DB] SQLite database initialized at", DB_PATH);
  return db;
}

function saveToFile(): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

export function insertTelemetry(data: TelemetryData): void {
  db.run(
    `INSERT INTO telemetry 
      (heater_1, heater_2, screw_motor_speed, filament_diameter, filament_diameter_setting, fans_on, spool_motor_speed, device_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.heater_1 ?? null,
      data.heater_2 ?? null,
      data.screw_motor_speed ?? null,
      data.filament_diameter ?? null,
      data.filament_diameter_setting ?? 2.85,
      data.fans_on ? 1 : 0,
      data.spool_motor_speed ?? null,
      data.device_id ?? "unknown",
    ]
  );

  // Persist to disk every insert (Store-and-Forward)
  saveToFile();
}

export function getRecentTelemetry(limit: number = 100): TelemetryData[] {
  const stmt = db.prepare("SELECT * FROM telemetry ORDER BY id DESC LIMIT ?");
  stmt.bind([limit]);

  const results: TelemetryData[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({
      device_id: row.device_id as string,
      heater_1: row.heater_1 as number,
      heater_2: row.heater_2 as number,
      screw_motor_speed: row.screw_motor_speed as number,
      filament_diameter: row.filament_diameter as number,
      filament_diameter_setting: row.filament_diameter_setting as number | undefined,
      fans_on: !!(row.fans_on as number),
      spool_motor_speed: row.spool_motor_speed as number,
      timestamp: row.timestamp as string,
    });
  }
  stmt.free();
  return results;
}

export function closeDatabase(): void {
  if (db) {
    saveToFile();
    db.close();
  }
}
