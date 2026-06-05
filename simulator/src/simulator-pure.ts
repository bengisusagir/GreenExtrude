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
  heater_3: number;
  motor_speed: number;
  filament_diameter: number;
  winder_speed: number;
  running: boolean;
}

export const DEFAULT_STATE: SimState = {
  heater_1: 180,
  heater_2: 200,
  heater_3: 195,
  motor_speed: 30,
  filament_diameter: 2.85,
  winder_speed: 25,
  running: true,
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
  const temp3 = addNoise(state.heater_3, 2.5);
  const motor = addNoise(state.motor_speed, 1);
  const diameter = addNoise(state.filament_diameter, 0.08);
  const winder = addNoise(state.winder_speed, 0.5);

  return {
    device_id: DEVICE_ID,
    // Temperature readings can never be negative — clamp after noise/anomaly
    heater_1: Math.max(0, maybeInjectAnomaly(temp1, state.heater_1, 245, 50, randomProvider())),
    heater_2: Math.max(0, maybeInjectAnomaly(temp2, state.heater_2, 250, 40, randomProvider())),
    heater_3: Math.max(0, maybeInjectAnomaly(temp3, state.heater_3, 240, 55, randomProvider())),
    motor_speed: Math.max(0, maybeInjectAnomaly(motor, state.motor_speed, 80, 0, randomProvider())),
    filament_diameter: Math.max(0, maybeInjectAnomaly(diameter, state.filament_diameter, 3.25, 2.5, randomProvider())),
    winder_speed: Math.max(0, maybeInjectAnomaly(winder, state.winder_speed, 70, 0, randomProvider())),
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
      if (cmd.zone === 1) next.heater_1 = cmd.value ?? next.heater_1;
      if (cmd.zone === 2) next.heater_2 = cmd.value ?? next.heater_2;
      if (cmd.zone === 3) next.heater_3 = cmd.value ?? next.heater_3;
      break;

    case "SET_MOTOR_SPEED":
      next.motor_speed = Math.max(0, cmd.value ?? next.motor_speed);
      break;

    case "SET_WINDER_SPEED":
      next.winder_speed = Math.max(0, cmd.value ?? next.winder_speed);
      break;

    case "EMERGENCY_STOP":
      next.running = false;
      next.motor_speed = 0;
      next.winder_speed = 0;
      break;

    case "START":
      next.running = true;
      next.motor_speed = 30;
      next.winder_speed = 25;
      break;

    case "STOP":
      next.running = false;
      // SAFETY: Stopped machine must not have spinning motors/winder
      next.motor_speed = 0;
      next.winder_speed = 0;
      break;

    default:
      // Unknown command — ignore
      break;
  }

  return next;
}
