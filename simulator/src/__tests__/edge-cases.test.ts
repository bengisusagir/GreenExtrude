/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — Simulator Edge Case Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Key expected behavior for an industrial simulator:
 *   - Negative temperatures are physically impossible for an extruder → should be rejected or clamped
 *   - Negative motor/winder speeds are invalid → should be rejected or clamped to 0
 *   - Negative filament diameters are impossible → should be rejected or clamped
 *   - STOP should stop motors/winder (safety!), not just set running=false
 *   - SET_TEMPERATURE/SET_MOTOR_SPEED/SET_WINDER_SPEED should validate ranges
 *   - Anomaly injection can produce negative values (spikeLow=0 for motors) — acceptable for simulation
 *
 * Covered: SEDGE-01..18
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

// ═══════════════════════════════════════════════════════════════════════════
// addNoise edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe("addNoise edge cases", () => {
  it("SEDGE-01: works with very large values", () => {
    const result = addNoise(1e9, 10);
    expect(result).toBeGreaterThanOrEqual(1e9 - 5);
    expect(result).toBeLessThanOrEqual(1e9 + 5);
  });

  it("SEDGE-02: works with very small range (0.001)", () => {
    const result = addNoise(100, 0.001);
    expect(result).toBeGreaterThanOrEqual(99.9995);
    expect(result).toBeLessThanOrEqual(100.0005);
  });

  it("SEDGE-03: preserves 2 decimal places even for small numbers", () => {
    for (let i = 0; i < 100; i++) {
      const result = addNoise(0.01, 0.02);
      const parts = result.toString().split(".");
      if (parts[1]) {
        expect(parts[1].length).toBeLessThanOrEqual(2);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// maybeInjectAnomaly edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe("maybeInjectAnomaly edge cases", () => {
  it("SEDGE-04: spikeHigh and spikeLow are the same value", () => {
    const result = maybeInjectAnomaly(200, 200, 42, 42, 0.0); // triggers anomaly
    expect(result).toBe(42);
  });

  it("SEDGE-05: random value just below ANOMALY_CHANCE/2 → spikeHigh", () => {
    const r = ANOMALY_CHANCE / 2 - 0.001;
    const result = maybeInjectAnomaly(200, 200, 245, 50, r);
    expect(result).toBe(245);
  });

  it("SEDGE-06: random value just above ANOMALY_CHANCE/2 but below ANOMALY_CHANCE → spikeLow", () => {
    const r = ANOMALY_CHANCE / 2 + 0.001;
    const result = maybeInjectAnomaly(200, 200, 245, 50, r);
    expect(result).toBe(50);
  });

  // SEDGE-07: Negative spikeHigh value — the anomaly function itself is value-agnostic
  // It simply returns whatever spikeHigh/spikeLow it's given. This is acceptable;
  // the CALLING code should validate the resulting telemetry, not the anomaly function.
  it("SEDGE-07: negative spikeHigh value is returned as-is (anomaly function is value-agnostic)", () => {
    const result = maybeInjectAnomaly(200, 200, -100, 50, 0.0);
    expect(result).toBe(-100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// generateTelemetry edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe("generateTelemetry edge cases", () => {
  it("SEDGE-08: zero-value state produces valid telemetry structure", () => {
    const zeroState: SimState = {
      heater_1: 0,
      heater_2: 0,
      screw_motor_speed: 0,
      filament_diameter: 0,
      filament_diameter_setting: 2.85,
      spool_motor_speed: 0,
      running: true,
    };
    const data = generateTelemetry(zeroState, () => 1.0); // no anomaly
    expect(data.device_id).toBe("esp32-simulator-01");
    expect(data.heater_1).toBeGreaterThanOrEqual(-1.5);
    expect(data.heater_1).toBeLessThanOrEqual(1.5);
  });

  // SEDGE-09: Negative temperatures in state should NOT produce negative telemetry
  // An extruder cannot have negative temperature. This is physically impossible.
  // CURRENT: generateTelemetry adds noise around -50 → produces negative readings
  // EXPECTED: generateTelemetry should clamp sensor values to >= 0
  it("SEDGE-09: negative heater state values should NOT produce negative telemetry readings", () => {
    const negState: SimState = {
      heater_1: -50,
      heater_2: -50,
      screw_motor_speed: -10,
      filament_diameter: -1.0,
      filament_diameter_setting: 2.85,
      spool_motor_speed: -5,
      running: true,
    };
    const data = generateTelemetry(negState, () => 1.0); // no anomaly
    // Temperature readings should never be negative — this is physically impossible
    expect(data.heater_1).toBeGreaterThanOrEqual(0);
    expect(data.heater_2).toBeGreaterThanOrEqual(0);
    // Motor/diameter should also be non-negative
    expect(data.screw_motor_speed).toBeGreaterThanOrEqual(0);
    expect(data.filament_diameter).toBeGreaterThanOrEqual(0);
    expect(data.spool_motor_speed).toBeGreaterThanOrEqual(0);
  });

  it("SEDGE-10: very high state values with anomaly produce spikeHigh", () => {
    const highState: SimState = {
      ...DEFAULT_STATE,
      heater_1: 500,
    };
    const data = generateTelemetry(highState, () => 0.0); // full anomaly
    expect(data.heater_1).toBe(245); // spikeHigh for heater_1
  });

  it("SEDGE-11: generateTelemetry always includes device_id and timestamp", () => {
    const data = generateTelemetry(DEFAULT_STATE, () => 0.5);
    expect(data.device_id).toBeTruthy();
    expect(data.timestamp).toBeTruthy();
    expect(() => new Date(data.timestamp!)).not.toThrow();
  });

  // SEDGE-12: Filament diameter anomaly can return 2.5 (below TARGET) — acceptable
  // This simulates a real sensor glitch, the value is within physical range
  it("SEDGE-12: filament_diameter spikeLow (2.5) is within physical range", () => {
    const data = generateTelemetry(DEFAULT_STATE, () => ANOMALY_CHANCE / 2 + 0.001);
    // spikeLow for diameter is 2.5 — within possible filament range
    expect(data.filament_diameter).toBe(2.5);
    // This is acceptable — 2.5mm is a physically possible diameter
  });

  // SEDGE-13: Anomaly spikeLow=0 for screw_motor_speed/spool_motor_speed
  // Motor speed = 0 is valid (motor stopped), not a sensor error
  it("SEDGE-13: screw_motor_speed spikeLow=0 is valid (represents stopped motor)", () => {
    const data = generateTelemetry(DEFAULT_STATE, () => ANOMALY_CHANCE / 2 + 0.001);
    // spikeLow for screw_motor_speed is 0 — represents a stopped motor, physically valid
    expect(data.screw_motor_speed).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// applyCommand edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe("applyCommand edge cases", () => {
  it("SEDGE-14: START when already running resets motors to defaults", () => {
    const runningState: SimState = {
      ...DEFAULT_STATE,
      screw_motor_speed: 55,
      spool_motor_speed: 40,
      running: true,
    };
    const next = applyCommand(runningState, { type: "START" });
    expect(next.screw_motor_speed).toBe(30);
    expect(next.spool_motor_speed).toBe(25);
    expect(next.running).toBe(true);
  });

  // SEDGE-15: ?? operator correctly preserves value=0
  // This was a previous concern — ?? only replaces null/undefined, NOT 0
  it("SEDGE-15: SET_TEMPERATURE with value=0 preserves 0 (?? does NOT replace falsy 0)", () => {
    const next = applyCommand(DEFAULT_STATE, {
      type: "SET_TEMPERATURE",
      zone: 1,
      value: 0,
    });
    expect(next.heater_1).toBe(0);
  });

  // SEDGE-16: STOP should zero motor speeds for safety
  // A stopped machine should not have spinning motors
  it("SEDGE-16: STOP should zero screw_motor_speed and spool_motor_speed (safety)", () => {
    const runningState: SimState = {
      ...DEFAULT_STATE,
      screw_motor_speed: 45,
      spool_motor_speed: 30,
      running: true,
    };
    const next = applyCommand(runningState, { type: "STOP" });
    expect(next.running).toBe(false);
    // SAFETY: Stopped machine must not have spinning motors
    expect(next.screw_motor_speed).toBe(0);
    expect(next.spool_motor_speed).toBe(0);
  });

  it("SEDGE-17: rapid command sequence (EMERGENCY_STOP → START → STOP)", () => {
    let state = { ...DEFAULT_STATE };
    state = applyCommand(state, { type: "EMERGENCY_STOP" });
    expect(state.running).toBe(false);
    expect(state.screw_motor_speed).toBe(0);

    state = applyCommand(state, { type: "START" });
    expect(state.running).toBe(true);
    expect(state.screw_motor_speed).toBe(30);

    state = applyCommand(state, { type: "STOP" });
    expect(state.running).toBe(false);
    // After STOP, motors should be 0 (see SEDGE-16)
    expect(state.screw_motor_speed).toBe(0);
  });

  // SEDGE-18: SET_SCREW_MOTOR_SPEED with negative value should be rejected
  it("SEDGE-18: SET_SCREW_MOTOR_SPEED with negative value should be clamped to 0", () => {
    const next = applyCommand(DEFAULT_STATE, {
      type: "SET_SCREW_MOTOR_SPEED",
      value: -10,
    });
    expect(next.screw_motor_speed).toBeGreaterThanOrEqual(0);
  });
});
