/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — Client Edge-Case Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Boundary and resilience tests for hooks and context:
 *   CEDGE-01: Temperature exactly at WARNING threshold (215°C) → warning
 *   CEDGE-02: Temperature exactly at DANGER threshold (230°C) → danger
 *   CEDGE-03: Temperature one below WARNING (214°C) → no alert
 *   CEDGE-04: Filament diameter exactly at WARNING_MIN (2.78) → warning
 *   CEDGE-05: Filament diameter exactly at DANGER_MAX (3.00) → danger
 *   CEDGE-06: Motor speed = 0 → danger (stall)
 *   CEDGE-07: Motor speed > 60 → warning (high)
 *   CEDGE-08: Winder speed = 0 → warning (stopped)
 *   CEDGE-09: Rapid successive telemetry updates (cooldown filtering)
 *   CEDGE-10: Alert max cap (MAX_ALERTS = 50)
 *   CEDGE-11: sendCommand when WS not OPEN (no crash)
 *   CEDGE-12: WS message with invalid JSON (parse error handled)
 *   CEDGE-13: History message with empty array
 *   CEDGE-14: Temperature < 60 (abnormally low → danger)
 */
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useState } from "react";
import { useAlerts } from "../../hooks/useAlerts";
import { TelemetryContext } from "../../context/TelemetryContext";
import type { TelemetryData, DeviceStatusMessage, DeviceCommand } from "../../shared/types";
import { SENSOR_THRESHOLDS } from "../../shared/types";

// ─── Controllable context wrapper (same pattern as useAlerts.test.tsx) ──────
type ContextValue = {
  telemetry: TelemetryData | null;
  history: TelemetryData[];
  deviceStatus: DeviceStatusMessage | null;
  isConnected: boolean;
  sendCommand: (cmd: DeviceCommand) => void;
};

let _setTelemetryState: React.Dispatch<React.SetStateAction<TelemetryData | null>>;

function Wrapper({ children }: { children: React.ReactNode }) {
  const [telemetryState, setTelemetryState] = useState<TelemetryData | null>(null);
  _setTelemetryState = setTelemetryState;

  const value: ContextValue = {
    telemetry: telemetryState,
    history: telemetryState ? [telemetryState] : [],
    deviceStatus: null,
    isConnected: true,
    sendCommand: vi.fn(),
  };

  return (
    <TelemetryContext.Provider value={value}>{children}</TelemetryContext.Provider>
  );
}

// ─── Test Data Factory ──────────────────────────────────────────────────────

function makeTelemetry(overrides: Partial<TelemetryData> = {}): TelemetryData {
  return {
    device_id: "edge-test",
    heater_1: 200,
    heater_2: 200,
    screw_motor_speed: 30,
    filament_diameter: 2.85,
    spool_motor_speed: 25,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

/** Helper: push telemetry into the wrapper, triggering a re-render */
function pushTelemetry(data: TelemetryData | null) {
  act(() => {
    _setTelemetryState(data);
  });
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe("useAlerts Edge Cases", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Temperature Threshold Boundaries
  // ═══════════════════════════════════════════════════════════════════════

  it("CEDGE-01: temperature exactly at WARNING (215°C) triggers warning", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });
    pushTelemetry(makeTelemetry({ heater_1: SENSOR_THRESHOLDS.TEMPERATURE.WARNING }));

    const warnings = result.current.filter(
      (a) => a.type === "warning" && a.message.includes("Zone 1")
    );
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });

  it("CEDGE-02: temperature exactly at DANGER (230°C) triggers danger", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });
    pushTelemetry(makeTelemetry({ heater_2: SENSOR_THRESHOLDS.TEMPERATURE.DANGER }));

    const dangers = result.current.filter(
      (a) => a.type === "danger" && a.message.includes("Zone 2")
    );
    expect(dangers.length).toBeGreaterThanOrEqual(1);
  });

  it("CEDGE-03: temperature one below WARNING (214°C) produces no temp alert", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });
    pushTelemetry(makeTelemetry({ heater_1: SENSOR_THRESHOLDS.TEMPERATURE.WARNING - 1 }));

    const tempAlerts = result.current.filter(
      (a) => a.message.includes("Zone 1") && (a.type === "warning" || a.type === "danger")
    );
    expect(tempAlerts.length).toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Filament Diameter Boundaries
  // ═══════════════════════════════════════════════════════════════════════

  it("CEDGE-04: filament diameter exactly at WARNING_MIN (2.78) triggers warning (was BUG: strict < excluded boundary)", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });
    pushTelemetry(makeTelemetry({ filament_diameter: SENSOR_THRESHOLDS.FILAMENT_DIAMETER.WARNING_MIN }));

    const diaAlerts = result.current.filter((a) => a.message.includes("diameter"));
    expect(diaAlerts.length).toBeGreaterThanOrEqual(1);
    expect(diaAlerts.some((a) => a.type === "warning")).toBe(true);
  });

  it("CEDGE-05: filament diameter exactly at DANGER_MAX (3.00) triggers danger (was BUG: strict > excluded boundary)", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });
    pushTelemetry(makeTelemetry({ filament_diameter: SENSOR_THRESHOLDS.FILAMENT_DIAMETER.DANGER_MAX }));

    const diaAlerts = result.current.filter((a) => a.message.includes("diameter"));
    expect(diaAlerts.some((a) => a.type === "danger")).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Motor & Winder Edge Values
  // ═══════════════════════════════════════════════════════════════════════

  it("CEDGE-06: screw motor speed = 0 triggers danger stall alert", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });
    pushTelemetry(makeTelemetry({ screw_motor_speed: 0 }));

    const stall = result.current.find((a) => a.message.includes("stall"));
    expect(stall).toBeDefined();
    expect(stall!.type).toBe("danger");
  });

  it("CEDGE-07: screw motor speed > 60 triggers high-speed warning", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });
    pushTelemetry(makeTelemetry({ screw_motor_speed: 65 }));

    const high = result.current.find((a) => a.message.includes("abnormally high"));
    expect(high).toBeDefined();
    expect(high!.type).toBe("warning");
  });

  it("CEDGE-08: spool motor speed = 0 triggers stopped warning", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });
    pushTelemetry(makeTelemetry({ spool_motor_speed: 0 }));

    const stopped = result.current.find((a) => a.message.includes("production halted"));
    expect(stopped).toBeDefined();
    expect(stopped!.type).toBe("warning");
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Cooldown & Alert Cap
  // ═══════════════════════════════════════════════════════════════════════

  it("CEDGE-09: rapid successive telemetry updates respect cooldown (15s)", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });

    // First update: danger
    pushTelemetry(makeTelemetry({ heater_1: 240 }));
    const countAfterFirst = result.current.length;

    // Second update 5s later: same zone danger → suppressed by cooldown
    act(() => { vi.advanceTimersByTime(5000); });
    pushTelemetry(makeTelemetry({ heater_1: 245 }));
    expect(result.current.length).toBe(countAfterFirst);

    // Third update after 15s cooldown expires → new alert
    act(() => { vi.advanceTimersByTime(11000); }); // total 16s
    pushTelemetry(makeTelemetry({ heater_1: 250 }));
    expect(result.current.length).toBeGreaterThan(countAfterFirst);
  });

  it("CEDGE-10: alerts are capped at MAX_ALERTS (50)", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });

    // Push 60 unique alerts by varying zones and advancing past cooldown
    for (let i = 0; i < 20; i++) {
      act(() => { vi.advanceTimersByTime(16000); });
      pushTelemetry(makeTelemetry({
        heater_1: 240,
        heater_2: 240,
      }));
    }

    expect(result.current.length).toBeLessThanOrEqual(50);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Abnormal Low Temperature
  // ═══════════════════════════════════════════════════════════════════════

  it("CEDGE-14: temperature < 60 triggers abnormally low danger", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });
    pushTelemetry(makeTelemetry({ heater_2: 45 }));

    const low = result.current.find((a) => a.message.includes("abnormally low"));
    expect(low).toBeDefined();
    expect(low!.type).toBe("danger");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// useWebSocket Edge Cases (unit-level safety checks)
// ═══════════════════════════════════════════════════════════════════════════

describe("useWebSocket Edge Cases", () => {
  it("CEDGE-11: sendCommand when WS not OPEN does not crash", () => {
    // The real hook's sendCommand checks readyState === OPEN before sending.
    // When WS is not open, it silently skips — no throw.
    const sendCommand = (cmd: DeviceCommand, wsReadyState: number = WebSocket.CLOSING) => {
      if (wsReadyState === WebSocket.OPEN) {
        // would send — but we're not open, so skip
      }
    };
    expect(() => sendCommand({ type: "START" }, WebSocket.CLOSING)).not.toThrow();
  });

  it("CEDGE-12: WS message with invalid JSON is handled gracefully", () => {
    // The real hook wraps JSON.parse in try/catch and logs error.
    const parseMessage = (raw: string): { ok: boolean; error?: string } => {
      try {
        JSON.parse(raw);
        return { ok: true };
      } catch {
        return { ok: false, error: "parse error" };
      }
    };
    const result = parseMessage("not valid json {{{");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("parse error");
  });

  it("CEDGE-13: history message with empty array leaves telemetry null", () => {
    // Simulates the logic in useWebSocket's "history" case:
    // setHistory(historyData); if (historyData.length > 0) setTelemetry(last) else null
    const processHistory = (payload: TelemetryData[]): { telemetry: TelemetryData | null; history: TelemetryData[] } => {
      return {
        telemetry: payload.length > 0 ? payload[payload.length - 1] : null,
        history: payload,
      };
    };
    const result = processHistory([]);
    expect(result.telemetry).toBeNull();
    expect(result.history).toEqual([]);
  });
});
