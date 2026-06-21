/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — Simulator Unit Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests the pure functions extracted from the simulator:
 *   addNoise, maybeInjectAnomaly, generateTelemetry, applyCommand
 *
 * Covered:
 *   SIM-01..19 (noise, anomaly, telemetry generation, command handling)
 */
import { describe, it, expect } from "vitest";
import {
  addNoise,
  maybeInjectAnomaly,
  generateTelemetry,
  applyCommand,
  DEFAULT_STATE,
  ANOMALY_CHANCE,
  type SimState,
} from "../simulator-pure";
import type { DeviceCommand } from "../../../shared/types";

// ═══════════════════════════════════════════════════════════════════════════
// addNoise
// ═══════════════════════════════════════════════════════════════════════════

describe("addNoise", () => {
  it("SIM-01: returns a number within ±range/2 of the input value", () => {
    const value = 200;
    const range = 10;
    // Run 1000 samples to be confident
    for (let i = 0; i < 1000; i++) {
      const result = addNoise(value, range);
      expect(result).toBeGreaterThanOrEqual(value - range / 2);
      expect(result).toBeLessThanOrEqual(value + range / 2);
    }
  });

  it("SIM-02: returns exactly the value when range is 0", () => {
    expect(addNoise(100, 0)).toBe(100);
  });

  it("SIM-03: result has exactly 2 decimal places", () => {
    const result = addNoise(150.123, 5);
    const decimals = result.toString().split(".")[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });

  it("SIM-04: works with negative values", () => {
    const result = addNoise(-10, 2);
    expect(result).toBeGreaterThanOrEqual(-11);
    expect(result).toBeLessThanOrEqual(-9);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// maybeInjectAnomaly
// ═══════════════════════════════════════════════════════════════════════════

describe("maybeInjectAnomaly", () => {
  it("SIM-05: returns original value when random is above threshold", () => {
    const value = 200;
    // random = 1.0 is always above ANOMALY_CHANCE (0.08)
    expect(maybeInjectAnomaly(value, 200, 245, 50, 1.0)).toBe(value);
  });

  it("SIM-06: returns spikeHigh when random indicates high anomaly", () => {
    // random = 0.0 → less than ANOMALY_CHANCE/2 → should pick spikeLow
    // Actually the logic: if random < ANOMALY_CHANCE, then check random < ANOMALY_CHANCE/2 → spikeHigh, else spikeLow
    // random = 0.0 → < 0.04 → spikeHigh
    expect(maybeInjectAnomaly(200, 200, 245, 50, 0.0)).toBe(245);
  });

  it("SIM-07: returns spikeLow when random indicates low anomaly", () => {
    // random = 0.06 → < 0.08 but >= 0.04 → spikeLow
    expect(maybeInjectAnomaly(200, 200, 245, 50, 0.06)).toBe(50);
  });

  it("SIM-08: does NOT inject anomaly when random exactly equals threshold", () => {
    // random = ANOMALY_CHANCE (0.08) → NOT < ANOMALY_CHANCE → no anomaly
    expect(maybeInjectAnomaly(200, 200, 245, 50, ANOMALY_CHANCE)).toBe(200);
  });

  it("SIM-09: boundary test at ANOMALY_CHANCE/2", () => {
    // random = ANOMALY_CHANCE/2 (0.04) → < ANOMALY_CHANCE → anomaly
    // AND random < ANOMALY_CHANCE/2 is false (0.04 < 0.04 is false) → spikeLow
    expect(maybeInjectAnomaly(200, 200, 245, 50, ANOMALY_CHANCE / 2)).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// generateTelemetry
// ═══════════════════════════════════════════════════════════════════════════

describe("generateTelemetry", () => {
  it("SIM-10: produces a valid TelemetryData object", () => {
    const data = generateTelemetry(DEFAULT_STATE, () => 1.0); // no anomalies
    expect(data).toHaveProperty("device_id", "esp32-simulator-01");
    expect(data).toHaveProperty("heater_1");
    expect(data).toHaveProperty("heater_2");
    expect(data).toHaveProperty("screw_motor_speed");
    expect(data).toHaveProperty("filament_diameter");
    expect(data).toHaveProperty("filament_diameter_setting");
    expect(data).toHaveProperty("spool_motor_speed");
    expect(data).toHaveProperty("timestamp");
  });

  it("SIM-11: timestamp is a valid ISO 8601 string", () => {
    const data = generateTelemetry(DEFAULT_STATE, () => 1.0);
    expect(new Date(data.timestamp!).toISOString()).toBe(data.timestamp);
  });

  it("SIM-12: values are within noise range when no anomaly", () => {
    const data = generateTelemetry(DEFAULT_STATE, () => 1.0);
    // heater_1 base=180, noise range=3 → [178.5, 181.5]
    expect(data.heater_1).toBeGreaterThanOrEqual(178.5);
    expect(data.heater_1).toBeLessThanOrEqual(181.5);
  });

  it("SIM-13: anomaly values are injected when random is low", () => {
    // With random = 0, all fields get anomaly (high spike)
    const data = generateTelemetry(DEFAULT_STATE, () => 0.0);
    // heater_1 spikeHigh = 245
    expect(data.heater_1).toBe(245);
    // heater_2 spikeHigh = 250
    expect(data.heater_2).toBe(250);
  });

  it("SIM-14: filament_diameter is within noise range without anomaly", () => {
    const data = generateTelemetry(DEFAULT_STATE, () => 1.0);
    // base=2.85, range=0.08 → [2.81, 2.89]
    expect(data.filament_diameter).toBeGreaterThanOrEqual(2.81);
    expect(data.filament_diameter).toBeLessThanOrEqual(2.89);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// applyCommand
// ═══════════════════════════════════════════════════════════════════════════

describe("applyCommand", () => {
  it("SIM-15: SET_TEMPERATURE zone 1 updates heater_1", () => {
    const cmd: DeviceCommand = { type: "SET_TEMPERATURE", zone: 1, value: 220 };
    const next = applyCommand(DEFAULT_STATE, cmd);
    expect(next.heater_1).toBe(220);
    expect(next.heater_2).toBe(DEFAULT_STATE.heater_2); // unchanged
  });

  it("SIM-16: SET_TEMPERATURE zone 2 updates heater_2", () => {
    const cmd: DeviceCommand = { type: "SET_TEMPERATURE", zone: 2, value: 215 };
    const next = applyCommand(DEFAULT_STATE, cmd);
    expect(next.heater_2).toBe(215);
  });

  it("SIM-17: SET_SCREW_MOTOR_SPEED updates screw_motor_speed", () => {
    const cmd: DeviceCommand = { type: "SET_SCREW_MOTOR_SPEED", value: 50 };
    const next = applyCommand(DEFAULT_STATE, cmd);
    expect(next.screw_motor_speed).toBe(50);
  });

  it("SIM-18: SET_SPOOL_MOTOR_SPEED updates spool_motor_speed", () => {
    const cmd: DeviceCommand = { type: "SET_SPOOL_MOTOR_SPEED", value: 40 };
    const next = applyCommand(DEFAULT_STATE, cmd);
    expect(next.spool_motor_speed).toBe(40);
  });

  it("SIM-19: SET_TEMPERATURE with no value keeps current state", () => {
    const cmd: DeviceCommand = { type: "SET_TEMPERATURE", zone: 1 };
    const next = applyCommand(DEFAULT_STATE, cmd);
    expect(next.heater_1).toBe(DEFAULT_STATE.heater_1);
  });

  it("SIM-20: EMERGENCY_STOP halts everything", () => {
    const cmd: DeviceCommand = { type: "EMERGENCY_STOP" };
    const next = applyCommand(DEFAULT_STATE, cmd);
    expect(next.running).toBe(false);
    expect(next.screw_motor_speed).toBe(0);
    expect(next.spool_motor_speed).toBe(0);
  });

  it("SIM-21: START resumes running and resets motor defaults", () => {
    // First stop
    const stopped = applyCommand(DEFAULT_STATE, { type: "EMERGENCY_STOP" });
    expect(stopped.running).toBe(false);

    const cmd: DeviceCommand = { type: "START" };
    const next = applyCommand(stopped, cmd);
    expect(next.running).toBe(true);
    expect(next.screw_motor_speed).toBe(30);
    expect(next.spool_motor_speed).toBe(25);
  });

  it("SIM-22: STOP sets running to false and zeros motors (safety)", () => {
    const cmd: DeviceCommand = { type: "STOP" };
    const next = applyCommand(DEFAULT_STATE, cmd);
    expect(next.running).toBe(false);
    // SAFETY: Stopped machine must not have spinning motors
    expect(next.screw_motor_speed).toBe(0);
    expect(next.spool_motor_speed).toBe(0);
  });

  it("SIM-24: unknown command type returns state unchanged", () => {
    const cmd = { type: "UNKNOWN_CMD" } as unknown as DeviceCommand;
    const next = applyCommand(DEFAULT_STATE, cmd);
    expect(next).toEqual(DEFAULT_STATE);
  });

  it("SIM-25: does NOT mutate the original state", () => {
    const original = { ...DEFAULT_STATE };
    applyCommand(DEFAULT_STATE, { type: "EMERGENCY_STOP" });
    expect(DEFAULT_STATE).toEqual(original);
  });

  it("SIM-23: SET_TEMPERATURE with invalid zone (e.g. 4) does not change any heater", () => {
    const cmd: DeviceCommand = { type: "SET_TEMPERATURE", zone: 4, value: 999 };
    const next = applyCommand(DEFAULT_STATE, cmd);
    expect(next.heater_1).toBe(DEFAULT_STATE.heater_1);
    expect(next.heater_2).toBe(DEFAULT_STATE.heater_2);
  });

  it("SIM-24: sequential commands compose correctly", () => {
    let state = { ...DEFAULT_STATE };
    state = applyCommand(state, { type: "SET_TEMPERATURE", zone: 1, value: 220 });
    state = applyCommand(state, { type: "SET_SCREW_MOTOR_SPEED", value: 45 });
    state = applyCommand(state, { type: "EMERGENCY_STOP" });
    state = applyCommand(state, { type: "START" });

    expect(state.running).toBe(true);
    expect(state.screw_motor_speed).toBe(30); // reset by START
    expect(state.heater_1).toBe(220); // preserved through EMERGENCY_STOP
  });
});
