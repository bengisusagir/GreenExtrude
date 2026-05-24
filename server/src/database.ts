import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import fs from "fs";
import path from "path";
import { TelemetryData } from "../../shared/types";

const DB_PATH = path.join(__dirname, "..", "greenextrude.db");

let db: SqlJsDatabase;

export async function initDatabase(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();

  // Load existing DB file if it exists
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      heater_1 REAL,
      heater_2 REAL,
      heater_3 REAL,
      motor_speed REAL,
      filament_diameter REAL,
      winder_speed REAL,
      device_id TEXT
    )
  `);

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
      (heater_1, heater_2, heater_3, motor_speed, filament_diameter, winder_speed, device_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.heater_1 ?? null,
      data.heater_2 ?? null,
      data.heater_3 ?? null,
      data.motor_speed ?? null,
      data.filament_diameter ?? null,
      data.winder_speed ?? null,
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
      heater_3: row.heater_3 as number,
      motor_speed: row.motor_speed as number,
      filament_diameter: row.filament_diameter as number,
      winder_speed: row.winder_speed as number,
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
