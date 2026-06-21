/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — TelemetryContext Unit Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests the TelemetryContext provider and useTelemetry hook:
 *   - Provider renders children and passes WebSocket state
 *   - useTelemetry() returns context value inside provider
 *   - useTelemetry() throws when called outside provider
 *   - sendCommand forwarding
 *   - isConnected reflects WebSocket state
 *   - history accumulates data
 *   - TelemetryContext.Provider allows direct value injection
 *
 * Covered: TCTX-01..08
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import React from "react";
import { TelemetryProvider, useTelemetry, TelemetryContext } from "../../context/TelemetryContext";
import type { TelemetryData, DeviceCommand } from "../../../../shared/types";

// ─── Mock useWebSocket ───────────────────────────────────────────────────
// TelemetryProvider wraps useWebSocket — we control what it returns.

const mockSendCommand = vi.fn();
let mockWsReturn: {
  telemetry: TelemetryData | null;
  history: TelemetryData[];
  deviceStatus: any;
  isConnected: boolean;
  sendCommand: (cmd: DeviceCommand) => void;
};

vi.mock("../../hooks/useWebSocket", () => ({
  useWebSocket: () => mockWsReturn,
}));

// ─── Test Data ─────────────────────────────────────────────────────────────

function makeTelemetry(overrides: Partial<TelemetryData> = {}): TelemetryData {
  return {
    device_id: "esp32-test",
    timestamp: Date.now(),
    heater_1: 200,
    heater_2: 200,
    screw_motor_speed: 30,
    spool_motor_speed: 25,
    filament_diameter: 2.85,
    ...overrides,
  };
}

describe("TelemetryContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWsReturn = {
      telemetry: null,
      history: [],
      deviceStatus: null,
      isConnected: false,
      sendCommand: mockSendCommand,
    };
  });

  // ─── TCTX-01: useTelemetry returns value inside provider ───────────────
  it("TCTX-01: useTelemetry returns context value inside TelemetryProvider", () => {
    const { result } = renderHook(() => useTelemetry(), {
      wrapper: ({ children }) => <TelemetryProvider>{children}</TelemetryProvider>,
    });
    expect(result.current).toBeDefined();
    expect(result.current.telemetry).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  // ─── TCTX-02: useTelemetry throws outside provider ─────────────────────
  it("TCTX-02: useTelemetry throws when called outside TelemetryProvider", () => {
    // Suppress console.error for expected error
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      renderHook(() => useTelemetry());
    }).toThrow("useTelemetry() must be called inside <TelemetryProvider>.");
    spy.mockRestore();
  });

  // ─── TCTX-03: telemetry reflects useWebSocket return ───────────────────
  it("TCTX-03: telemetry value reflects useWebSocket return value", () => {
    const t = makeTelemetry();
    mockWsReturn.telemetry = t;
    const { result } = renderHook(() => useTelemetry(), {
      wrapper: ({ children }) => <TelemetryProvider>{children}</TelemetryProvider>,
    });
    expect(result.current.telemetry).toEqual(t);
  });

  // ─── TCTX-04: isConnected reflects useWebSocket state ──────────────────
  it("TCTX-04: isConnected reflects useWebSocket connected state", () => {
    mockWsReturn.isConnected = true;
    const { result } = renderHook(() => useTelemetry(), {
      wrapper: ({ children }) => <TelemetryProvider>{children}</TelemetryProvider>,
    });
    expect(result.current.isConnected).toBe(true);
  });

  // ─── TCTX-05: sendCommand forwards to useWebSocket ─────────────────────
  it("TCTX-05: sendCommand forwards command to useWebSocket", () => {
    const { result } = renderHook(() => useTelemetry(), {
      wrapper: ({ children }) => <TelemetryProvider>{children}</TelemetryProvider>,
    });
    const cmd: DeviceCommand = { type: "EMERGENCY_STOP" };
    result.current.sendCommand(cmd);
    expect(mockSendCommand).toHaveBeenCalledWith(cmd);
  });

  // ─── TCTX-06: history reflects useWebSocket return ─────────────────────
  it("TCTX-06: history reflects useWebSocket history array", () => {
    const t1 = makeTelemetry();
    const t2 = makeTelemetry({ heater_1: 210 });
    mockWsReturn.history = [t1, t2];
    const { result } = renderHook(() => useTelemetry(), {
      wrapper: ({ children }) => <TelemetryProvider>{children}</TelemetryProvider>,
    });
    expect(result.current.history).toHaveLength(2);
  });

  // ─── TCTX-07: deviceStatus reflects useWebSocket return ────────────────
  it("TCTX-07: deviceStatus reflects useWebSocket device status", () => {
    mockWsReturn.deviceStatus = { device_id: "esp32-test", status: "connected" };
    const { result } = renderHook(() => useTelemetry(), {
      wrapper: ({ children }) => <TelemetryProvider>{children}</TelemetryProvider>,
    });
    expect(result.current.deviceStatus).toEqual({ device_id: "esp32-test", status: "connected" });
  });

  // ─── TCTX-08: TelemetryContext.Provider allows direct value injection ──
  it("TCTX-08: TelemetryContext.Provider allows direct context injection", () => {
    const customValue = {
      telemetry: makeTelemetry({ heater_1: 999 }),
      history: [],
      deviceStatus: null,
      isConnected: true,
      sendCommand: vi.fn(),
    };
    const { result } = renderHook(() => useTelemetry(), {
      wrapper: ({ children }) => (
        <TelemetryContext.Provider value={customValue}>{children}</TelemetryContext.Provider>
      ),
    });
    expect(result.current.telemetry?.heater_1).toBe(999);
    expect(result.current.isConnected).toBe(true);
  });
});
