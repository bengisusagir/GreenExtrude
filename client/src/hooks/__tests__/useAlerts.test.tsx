/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — useAlerts Hook Unit Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests alert generation logic for all sensor threshold violations:
 *   - Temperature danger/warning/low
 *   - Filament diameter danger/warning
 *   - Motor stall/high
 *   - Winder stopped/high
 *   - Cooldown enforcement
 *   - MAX_ALERTS cap
 *
 * Covered: ALR-01..15
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React, { useState } from "react";
import { useAlerts } from "../../hooks/useAlerts";
import { TelemetryContext } from "../../context/TelemetryContext";
import type { TelemetryData, DeviceStatusMessage, DeviceCommand } from "../../../../shared/types";

// ─── Controllable context wrapper ──────────────────────────────────────────

type ContextValue = {
  telemetry: TelemetryData | null;
  history: TelemetryData[];
  deviceStatus: DeviceStatusMessage | null;
  isConnected: boolean;
  sendCommand: (cmd: DeviceCommand) => void;
};

// Module-level setter — tests call this to push new telemetry values
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

// ─── Test Data Factory ─────────────────────────────────────────────────────

function makeTelemetry(overrides: Partial<TelemetryData> = {}): TelemetryData {
  return {
    device_id: "esp32-test",
    heater_1: 200,
    heater_2: 205,
    heater_3: 190,
    motor_speed: 30,
    filament_diameter: 2.85,
    winder_speed: 25,
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

describe("useAlerts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Temperature Alerts
  // ═══════════════════════════════════════════════════════════════════════

  it("ALR-01: generates danger alert when heater_1 ≥ 230°C", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });
    pushTelemetry(makeTelemetry({ heater_1: 235 }));

    const dangerAlerts = result.current.filter(
      (a) => a.type === "danger" && a.message.includes("Zone 1")
    );
    expect(dangerAlerts.length).toBeGreaterThanOrEqual(1);
    expect(dangerAlerts[0].message).toContain("critical");
  });

  it("ALR-02: generates warning alert when heater_1 ≥ 215°C but < 230°C", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });
    pushTelemetry(makeTelemetry({ heater_1: 220 }));

    const warningAlerts = result.current.filter(
      (a) => a.type === "warning" && a.message.includes("Zone 1")
    );
    expect(warningAlerts.length).toBeGreaterThanOrEqual(1);
    expect(warningAlerts[0].message).toContain("high");
  });

  it("ALR-03: generates danger alert when temperature < 60°C (sensor failure)", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });
    pushTelemetry(makeTelemetry({ heater_2: 45 }));

    const lowAlerts = result.current.filter(
      (a) => a.type === "danger" && a.message.includes("Zone 2") && a.message.includes("low")
    );
    expect(lowAlerts.length).toBeGreaterThanOrEqual(1);
  });

  it("ALR-04: does NOT generate temperature alert for normal values", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });
    pushTelemetry(makeTelemetry({ heater_1: 200, heater_2: 205, heater_3: 190 }));

    const tempAlerts = result.current.filter((a) => a.message.includes("temperature"));
    expect(tempAlerts).toHaveLength(0);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Filament Diameter Alerts
  // ═══════════════════════════════════════════════════════════════════════

  it("ALR-05: generates danger alert when filament < 2.70mm", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });
    pushTelemetry(makeTelemetry({ filament_diameter: 2.65 }));

    const diaAlerts = result.current.filter(
      (a) => a.type === "danger" && a.message.includes("diameter")
    );
    expect(diaAlerts.length).toBeGreaterThanOrEqual(1);
    expect(diaAlerts[0].message).toContain("danger");
  });

  it("ALR-06: generates danger alert when filament > 3.00mm", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });
    pushTelemetry(makeTelemetry({ filament_diameter: 3.05 }));

    const diaAlerts = result.current.filter(
      (a) => a.type === "danger" && a.message.includes("diameter")
    );
    expect(diaAlerts.length).toBeGreaterThanOrEqual(1);
  });

  it("ALR-07: generates warning alert when filament in warning range", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });
    pushTelemetry(makeTelemetry({ filament_diameter: 2.76 })); // < 2.78 (WARNING_MIN)

    const diaAlerts = result.current.filter(
      (a) => a.type === "warning" && a.message.includes("diameter")
    );
    expect(diaAlerts.length).toBeGreaterThanOrEqual(1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Motor & Winder Alerts
  // ═══════════════════════════════════════════════════════════════════════

  it("ALR-08: generates danger alert when motor_speed = 0 (stall)", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });
    pushTelemetry(makeTelemetry({ motor_speed: 0 }));

    const stallAlerts = result.current.filter(
      (a) => a.type === "danger" && a.message.includes("stall")
    );
    expect(stallAlerts.length).toBeGreaterThanOrEqual(1);
  });

  it("ALR-09: generates warning alert when motor_speed > 60", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });
    pushTelemetry(makeTelemetry({ motor_speed: 65 }));

    const motorAlerts = result.current.filter(
      (a) => a.type === "warning" && a.message.includes("Motor") && a.message.includes("high")
    );
    expect(motorAlerts.length).toBeGreaterThanOrEqual(1);
  });

  it("ALR-10: generates warning alert when winder_speed = 0", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });
    pushTelemetry(makeTelemetry({ winder_speed: 0 }));

    const winderAlerts = result.current.filter(
      (a) => a.type === "warning" && a.message.includes("Winder")
    );
    expect(winderAlerts.length).toBeGreaterThanOrEqual(1);
  });

  it("ALR-11: generates warning alert when winder_speed > 55", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });
    pushTelemetry(makeTelemetry({ winder_speed: 60 }));

    const winderAlerts = result.current.filter(
      (a) => a.type === "warning" && a.message.includes("Winder") && a.message.includes("high")
    );
    expect(winderAlerts.length).toBeGreaterThanOrEqual(1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Cooldown & Cap
  // ═══════════════════════════════════════════════════════════════════════

  it("ALR-12: respects COOLDOWN_MS — no duplicate alerts within 15s", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });

    // First trigger
    pushTelemetry(makeTelemetry({ heater_1: 235 }));
    const countAfterFirst = result.current.filter((a) =>
      a.message.includes("Zone 1") && a.type === "danger"
    ).length;

    // Same trigger within cooldown — advance time but not past cooldown
    act(() => { vi.advanceTimersByTime(5000); });
    pushTelemetry(makeTelemetry({ heater_1: 240 }));
    const countAfterSecond = result.current.filter((a) =>
      a.message.includes("Zone 1") && a.type === "danger"
    ).length;

    // Should not increase — cooldown still active
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it("ALR-13: generates new alert after COOLDOWN_MS expires", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });

    pushTelemetry(makeTelemetry({ heater_1: 235 }));
    const countAfterFirst = result.current.filter((a) =>
      a.message.includes("Zone 1") && a.type === "danger"
    ).length;

    // Wait for cooldown to pass (15s + small buffer)
    act(() => { vi.advanceTimersByTime(16_000); });

    pushTelemetry(makeTelemetry({ heater_1: 240 }));
    const countAfterCooldown = result.current.filter((a) =>
      a.message.includes("Zone 1") && a.type === "danger"
    ).length;

    expect(countAfterCooldown).toBeGreaterThan(countAfterFirst);
  });

  it("ALR-14: caps alerts at MAX_ALERTS = 50", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });

    // Generate many alerts by varying zones/fields
    for (let i = 0; i < 60; i++) {
      const zone = ((i % 3) + 1) as 1 | 2 | 3;
      pushTelemetry(makeTelemetry({ [`heater_${zone}`]: 235 + i }));
      act(() => { vi.advanceTimersByTime(16_000); }); // bypass cooldown each time
    }

    expect(result.current.length).toBeLessThanOrEqual(50);
  });

  it("ALR-15: returns empty array when telemetry is null", () => {
    const { result } = renderHook(() => useAlerts(), { wrapper: Wrapper });
    // telemetry starts as null — no alert should be generated
    expect(result.current).toEqual([]);
  });
});
