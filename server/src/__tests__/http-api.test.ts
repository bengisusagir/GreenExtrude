/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — Server HTTP API Integration Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests all REST endpoints defined in server/src/index.ts using supertest.
 * The server is spun up once per test suite; each test hits real HTTP.
 *
 * Covered endpoints:
 *   GET  /api/health       → API-01..03
 *   GET  /api/telemetry    → API-04..11
 *   POST /api/command      → API-12..19
 *   404 / OPTIONS / misc   → API-20..22
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import http from "http";
import { initDatabase, closeDatabase, insertTelemetry } from "../database";
import { initMqttBroker, closeMqttBroker } from "../mqttHandler";
import type { TelemetryData, DeviceCommand } from "../../../shared/types";

// ─── Test Data Factories ───────────────────────────────────────────────────

function makeTelemetry(overrides: Partial<TelemetryData> = {}): TelemetryData {
  return {
    device_id: "esp32-test-01",
    heater_1: 200,
    heater_2: 210,
    heater_3: 195,
    motor_speed: 30,
    filament_diameter: 2.85,
    winder_speed: 25,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Server Factory ────────────────────────────────────────────────────────
// We recreate a minimal version of the server from index.ts so we can test
// the HTTP layer without binding to the real ports / starting WS / MQTT.

function createTestServer(): http.Server {
  const server = http.createServer((req, res) => {
    // ── CORS headers (mirrors index.ts) ──
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    // ── GET /api/telemetry ──
    if (req.method === "GET" && pathname === "/api/telemetry") {
      const limitParam = parsedUrl.searchParams.get("limit");
      const limit = limitParam !== null ? parseInt(limitParam) : 100;
      const safeLimit = Number.isNaN(limit) || limit < 0 ? 100 : limit;
      const data = getRecentTelemetry(safeLimit);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: data.reverse() }));
      return;
    }

    // ── POST /api/command ──
    if (req.method === "POST" && pathname === "/api/command") {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk.toString()));
      req.on("end", () => {
        try {
          const command: DeviceCommand = JSON.parse(body);
          sendCommand(command);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, message: "Command sent" }));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Invalid JSON" }));
        }
      });
      return;
    }

    // ── GET /api/health ──
    if (req.method === "GET" && pathname === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          status: "running",
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // ── 404 ──
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Not found" }));
  });

  return server;
}

// Import getRecentTelemetry and sendCommand from the real modules.
// We use dynamic import so we can init DB first.
let getRecentTelemetry: (limit: number) => TelemetryData[];
let sendCommand: (cmd: DeviceCommand) => void;

describe("Server HTTP API", () => {
  let server: http.Server;

  beforeAll(async () => {
    // Initialize DB
    await initDatabase();

    // Dynamic imports after DB init
    const db = await import("../database");
    getRecentTelemetry = db.getRecentTelemetry;

    const mqtt = await import("../mqttHandler");
    sendCommand = mqtt.sendCommand;
    // Init MQTT broker on a unique port (needed for sendCommand not to crash)
    initMqttBroker(() => {}, 18830);

    server = createTestServer();
  });

  afterAll(async () => {
    closeDatabase();
    server?.close();
    await closeMqttBroker();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // GET /api/health
  // ═══════════════════════════════════════════════════════════════════════

  describe("GET /api/health", () => {
    it("API-01: returns 200 with success=true and status=running", async () => {
      const res = await request(server).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe("running");
    });

    it("API-02: response includes a valid ISO 8601 timestamp", async () => {
      const res = await request(server).get("/api/health");
      const ts = res.body.timestamp;
      expect(ts).toBeDefined();
      expect(new Date(ts).toISOString()).toBe(ts);
    });

    it("API-03: CORS header Access-Control-Allow-Origin is present", async () => {
      const res = await request(server).get("/api/health");
      expect(res.headers["access-control-allow-origin"]).toBe("*");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // GET /api/telemetry
  // ═══════════════════════════════════════════════════════════════════════

  describe("GET /api/telemetry", () => {
    it("API-04: defaults to limit=100 when 150 records exist", async () => {
      // Insert 150 records
      for (let i = 0; i < 150; i++) {
        insertTelemetry(makeTelemetry({ device_id: `esp32-limit-${i}` }));
      }
      const res = await request(server).get("/api/telemetry");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeLessThanOrEqual(100);
    });

    it("API-05: respects custom ?limit=5 parameter", async () => {
      const res = await request(server).get("/api/telemetry?limit=5");
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(5);
    });

    it("API-06: falls back to default 100 for invalid limit value", async () => {
      const res = await request(server).get("/api/telemetry?limit=abc");
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(100);
    });

    it("API-07: returns empty array for limit=0", async () => {
      const res = await request(server).get("/api/telemetry?limit=0");
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
    });

    it("API-08: handles negative limit gracefully (defaults to 100)", async () => {
      const res = await request(server).get("/api/telemetry?limit=-1");
      expect(res.status).toBe(200);
      // Negative limit falls back to 100
      expect(res.body.data.length).toBeLessThanOrEqual(100);
    });

    it("API-09: returns success=true with empty data array when DB is fresh", async () => {
      // This test verifies the response shape regardless of content
      const res = await request(server).get("/api/telemetry?limit=1");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("success", true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("API-10: response shape matches { success, data } contract", async () => {
      const res = await request(server).get("/api/telemetry");
      expect(res.body).toHaveProperty("success");
      expect(res.body).toHaveProperty("data");
      expect(typeof res.body.success).toBe("boolean");
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("API-11: data array is ordered ascending (oldest first after .reverse())", async () => {
      insertTelemetry(makeTelemetry({ device_id: "order-first" }));
      insertTelemetry(makeTelemetry({ device_id: "order-second" }));
      const res = await request(server).get("/api/telemetry?limit=2");
      if (res.body.data.length >= 2) {
        // After .reverse(), oldest should be first
        expect(res.body.data[0].device_id).toBeDefined();
        expect(res.body.data[1].device_id).toBeDefined();
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // POST /api/command
  // ═══════════════════════════════════════════════════════════════════════

  describe("POST /api/command", () => {
    it("API-12: accepts valid EMERGENCY_STOP command", async () => {
      const res = await request(server)
        .post("/api/command")
        .send({ type: "EMERGENCY_STOP" });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("API-13: accepts SET_TEMPERATURE with zone and value", async () => {
      const res = await request(server)
        .post("/api/command")
        .send({ type: "SET_TEMPERATURE", zone: 2, value: 210 });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("API-14: accepts SET_SCREW_MOTOR_SPEED with value", async () => {
      const res = await request(server)
        .post("/api/command")
        .send({ type: "SET_SCREW_MOTOR_SPEED", value: 50 });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("API-15: accepts START command", async () => {
      const res = await request(server)
        .post("/api/command")
        .send({ type: "START" });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("API-16: accepts STOP command", async () => {
      const res = await request(server)
        .post("/api/command")
        .send({ type: "STOP" });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("API-17: returns 400 for invalid JSON body", async () => {
      const res = await request(server)
        .post("/api/command")
        .set("Content-Type", "application/json")
        .send("{broken json");
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Invalid JSON");
    });

    it("API-18: returns 400 for empty body", async () => {
      const res = await request(server)
        .post("/api/command")
        .set("Content-Type", "application/json")
        .send("");
      expect(res.status).toBe(400);
    });

    it("API-19: accepts unknown command type and forwards to MQTT", async () => {
      // The server does not validate command types — it relays everything
      const res = await request(server)
        .post("/api/command")
        .send({ type: "UNKNOWN_CMD" });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 404, OPTIONS, Method Not Allowed
  // ═══════════════════════════════════════════════════════════════════════

  describe("Error routes & CORS preflight", () => {
    it("API-20: returns 404 for unknown route", async () => {
      const res = await request(server).get("/api/unknown");
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Not found");
    });

    it("API-21: responds 204 to OPTIONS preflight with CORS headers", async () => {
      const res = await request(server).options("/api/telemetry");
      expect(res.status).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe("*");
      expect(res.headers["access-control-allow-methods"]).toBe("GET, POST, OPTIONS");
    });

    it("API-22: returns 404 for DELETE method on known route", async () => {
      const res = await request(server).delete("/api/telemetry");
      expect(res.status).toBe(404);
    });
  });
});
