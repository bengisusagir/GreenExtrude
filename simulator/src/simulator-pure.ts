/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — Simulator Pure Function Extracts
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The simulator (simulator/src/index.ts) keeps all logic inline with
 * module-level side effects (MQTT connect on import).  This file extracts
 * the *pure* functions so they can be unit-tested without starting a broker.
 *
 * When the simulator is refactored later, these functions should move back
 * into the main module and be exported directly.
 */

// ─── Configuration (mirrors simulator/src/index.ts) ────────────────────────
export const ANOMALY_CHANCE = 0.08;
export const DEVICE_ID = "esp32-simulator-01";

export interface SimState {
  heater_1: number;
  heater_2: number;
  screw_motor_speed: number;
  filament_diameter: number;
  filament_diameter_setting: number;
  spool_motor_speed: number;
  set_point: number;
  running: boolean;
  fans_on: boolean;
}

export const DEFAULT_STATE: SimState = {
  heater_1: 180,
  heater_2: 200,
  screw_motor_speed: 30,
  filament_diameter: 2.85,
  filament_diameter_setting: 2.85,
  spool_motor_speed: 25,
  set_point: 220,
  running: true,
  fans_on: true,
};

// ─── Pure Functions ────────────────────────────────────────────────────────

/**
 * Adds realistic Gaussian-like noise to a value.
 * Mirrors: addNoise(value, range) in simulator/src/index.ts
 */
export function addNoise(value: number, range: number): number {
  return +(value + (Math.random() - 0.5) * range).toFixed(2);
}

/**
 * Possibly injects an anomaly spike into a value.
 * Mirrors: maybeInjectAnomaly(value, normal, spikeHigh, spikeLow) in simulator/src/index.ts
 *
 * @param random  — a 0..1 value (usually Math.random()) so we can control it in tests
 */
export function maybeInjectAnomaly(
  value: number,
  normal: number,
  spikeHigh: number,
  spikeLow: number,
  random: number
): number {
  if (random < ANOMALY_CHANCE) {
    const spike = random < ANOMALY_CHANCE / 2 ? spikeHigh : spikeLow;
    return spike;
  }
  return value;
}

/**
 * Generates a telemetry payload from the current simulated state.
 * Mirrors: generateTelemetry() in simulator/src/index.ts
 *
 * @param randomProvider — injectable Math.random for deterministic tests
 */
export function generateTelemetry(
  state: SimState,
  randomProvider: () => number = Math.random
): import("../../shared/types").TelemetryData {
  const temp1 = addNoise(state.heater_1, 3);
  const temp2 = addNoise(state.heater_2, 2);
  const screwMotor = addNoise(state.screw_motor_speed, 1);
  const diameter = addNoise(state.filament_diameter, 0.08);
  const spoolMotor = addNoise(state.spool_motor_speed, 0.5);

  return {
    device_id: DEVICE_ID,
    // Temperature readings can never be negative — clamp after noise/anomaly
    heater_1: Math.max(0, maybeInjectAnomaly(temp1, state.heater_1, 245, 50, randomProvider())),
    heater_2: Math.max(0, maybeInjectAnomaly(temp2, state.heater_2, 250, 40, randomProvider())),
    screw_motor_speed: Math.max(0, maybeInjectAnomaly(screwMotor, state.screw_motor_speed, 80, 0, randomProvider())),
    filament_diameter: Math.max(0, maybeInjectAnomaly(diameter, state.filament_diameter, 3.25, 2.5, randomProvider())),
    filament_diameter_setting: state.filament_diameter_setting,
    spool_motor_speed: Math.max(0, maybeInjectAnomaly(spoolMotor, state.spool_motor_speed, 70, 0, randomProvider())),
    set_point: state.set_point,
    fans_on: state.fans_on,
    timestamp: new Date().toISOString(),
  };
}

import type { DeviceCommand } from "../../shared/types";

/**
 * Applies a command to the simulated state, returning a new state object.
 * Mirrors: command handler in simulator/src/index.ts
 */
export function applyCommand(state: SimState, cmd: DeviceCommand): SimState {
  const next = { ...state };

  switch (cmd.type) {
    case "SET_TEMPERATURE":
      next.heater_1 = cmd.value ?? next.heater_1; next.set_point = cmd.value ?? next.set_point;
      break;

    case "SET_SCREW_MOTOR_SPEED":
      next.screw_motor_speed = Math.max(0, cmd.value ?? next.screw_motor_speed);
      break;

    case "SET_SPOOL_MOTOR_SPEED":
      next.spool_motor_speed = Math.max(0, cmd.value ?? next.spool_motor_speed);
      break;

    case "SET_FILAMENT_DIAMETER":
      next.filament_diameter_setting = cmd.value ?? next.filament_diameter_setting;
      break;

    case "SET_FANS":
      next.fans_on = !!cmd.value;
      break;

    case "EMERGENCY_STOP":
      next.running = false;
      next.screw_motor_speed = 0;
      next.spool_motor_speed = 0;
      next.fans_on = false;
      break;

    case "START":
      next.running = true;
      next.screw_motor_speed = 30;
      next.spool_motor_speed = 25;
      break;

    case "STOP":
      next.running = false;
      // SAFETY: Stopped machine must not have spinning motors
      next.screw_motor_speed = 0;
      next.spool_motor_speed = 0;
      next.fans_on = false;
      break;

    default:
      // Unknown command — ignore
      break;
  }

  return next;
}
