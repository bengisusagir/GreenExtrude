/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — useWebSocket Hook Unit Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests the useWebSocket hook's WebSocket lifecycle and message handling:
 *   - Initial connection attempt on mount
 *   - telemetry messages update state
 *   - history messages update state
 *   - device_status messages update state
 *   - Connection status reflects open/close
 *   - Reconnection on close
 *   - sendCommand when connected
 *   - sendCommand when disconnected (no-op)
 *   - Parse error handling (malformed JSON)
 *   - Cleanup on unmount (close WS + clear timeout)
 *
 * Covered: WS-01..10
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebSocket } from "../../hooks/useWebSocket";
import type { TelemetryData, DeviceStatusMessage, DeviceCommand } from "../../../../shared/types";

// ─── Mock WebSocket ──────────────────────────────────────────────────────

type MockWebSocketInstance = {
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: ((err: Event) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

let mockWsInstance: MockWebSocketInstance;
let constructorCallCount: number;

// Use a real class so `new MockWebSocket()` works — vi.fn() arrow functions
// cannot be used as constructors.
class MockWebSocket {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((err: Event) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  readyState: number = WebSocket.CONNECTING;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = WebSocket.CLOSED;
  });

  constructor() {
    constructorCallCount++;
    // Capture the instance so tests can fire events on it
    mockWsInstance = this as unknown as MockWebSocketInstance;
    // Simulate async open on next tick
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  constructorCallCount = 0;
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── Test Data Factory ────────────────────────────────────────────────────

function makeTelemetry(overrides: Partial<TelemetryData> = {}): TelemetryData {
  return {
    device_id: "esp32-test",
    timestamp: new Date().toISOString(),
    heater_1: 200,
    heater_2: 200,
    heater_3: 200,
    motor_speed: 30,
    winder_speed: 25,
    filament_diameter: 2.85,
    ...overrides,
  };
}

function makeDeviceStatus(overrides: Partial<DeviceStatusMessage> = {}): DeviceStatusMessage {
  return {
    clientId: "esp32-test",
    status: "connected",
    ...overrides,
  };
}

// ─── Helper: simulate incoming WS message ─────────────────────────────────

function simulateMessage(data: unknown) {
  const event = { data: JSON.stringify(data) };
  act(() => {
    mockWsInstance.onmessage?.(event);
  });
}

function simulateOpen() {
  act(() => {
    mockWsInstance.readyState = WebSocket.OPEN;
    mockWsInstance.onopen?.();
  });
}

function simulateClose() {
  act(() => {
    mockWsInstance.readyState = WebSocket.CLOSED;
    mockWsInstance.onclose?.();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("useWebSocket Hook", () => {
  // ── WS-01: Creates WebSocket connection on mount ──────────────────────
  it("WS-01: creates WebSocket connection on mount", () => {
    renderHook(() => useWebSocket());
    expect(constructorCallCount).toBe(1);
  });

  // ── WS-02: isConnected becomes true when WS opens ────────────────────
  it("WS-02: isConnected becomes true when WS opens", () => {
    const { result } = renderHook(() => useWebSocket());
    expect(result.current.isConnected).toBe(false);

    simulateOpen();
    expect(result.current.isConnected).toBe(true);
  });

  // ── WS-03: telemetry messages update telemetry state ──────────────────
  it("WS-03: telemetry messages update telemetry state", () => {
    const { result } = renderHook(() => useWebSocket());
    const data = makeTelemetry({ heater_1: 220 });

    simulateMessage({ type: "telemetry", payload: data });

    expect(result.current.telemetry).not.toBeNull();
    expect(result.current.telemetry!.heater_1).toBe(220);
  });

  // ── WS-04: telemetry messages append to history ───────────────────────
  it("WS-04: telemetry messages append to history", () => {
    const { result } = renderHook(() => useWebSocket());
    const data1 = makeTelemetry({ heater_1: 200 });
    const data2 = makeTelemetry({ heater_1: 210 });

    simulateMessage({ type: "telemetry", payload: data1 });
    simulateMessage({ type: "telemetry", payload: data2 });

    expect(result.current.history.length).toBe(2);
  });

  // ── WS-05: history messages set history and last telemetry ────────────
  it("WS-05: history messages set history and last telemetry", () => {
    const { result } = renderHook(() => useWebSocket());
    const historyData = [
      makeTelemetry({ heater_1: 190 }),
      makeTelemetry({ heater_1: 200 }),
      makeTelemetry({ heater_1: 210 }),
    ];

    simulateMessage({ type: "history", payload: historyData });

    expect(result.current.history.length).toBe(3);
    expect(result.current.telemetry?.heater_1).toBe(210);
  });

  // ── WS-06: device_status messages update deviceStatus ─────────────────
  it("WS-06: device_status messages update deviceStatus", () => {
    const { result } = renderHook(() => useWebSocket());
    const status = makeDeviceStatus({ status: "disconnected" });

    simulateMessage({ type: "device_status", payload: status });

    expect(result.current.deviceStatus).not.toBeNull();
    expect(result.current.deviceStatus!.status).toBe("disconnected");
  });

  // ── WS-07: isConnected becomes false and reconnects on close ──────────
  it("WS-07: isConnected becomes false and schedules reconnect on close", () => {
    const { result } = renderHook(() => useWebSocket());
    simulateOpen();
    expect(result.current.isConnected).toBe(true);

    simulateClose();
    expect(result.current.isConnected).toBe(false);

    // Should have scheduled a reconnect (3s timeout)
    // After 3s, a new WebSocket should be created
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(constructorCallCount).toBe(2);
  });

  // ── WS-08: sendCommand sends JSON when connected ──────────────────────
  it("WS-08: sendCommand sends JSON message when connected", () => {
    const { result } = renderHook(() => useWebSocket());
    simulateOpen();

    const command: DeviceCommand = { type: "START" };
    act(() => {
      result.current.sendCommand(command);
    });

    expect(mockWsInstance.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "command", payload: command })
    );
  });

  // ── WS-09: sendCommand is no-op when disconnected ─────────────────────
  it("WS-09: sendCommand is no-op when disconnected", () => {
    const { result, unmount } = renderHook(() => useWebSocket());

    // Let the constructor's setTimeout fire so WS reaches OPEN
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(result.current.isConnected).toBe(true);

    // Unmount triggers cleanup: wsRef.current?.close() + clearTimeout
    // After unmount, sendCommand's wsRef.current is null → no-op
    unmount();

    const command: DeviceCommand = { type: "EMERGENCY_STOP" };
    // Calling sendCommand after unmount should be a no-op (wsRef.current is null)
    expect(() => {
      result.current.sendCommand(command);
    }).not.toThrow();
  });

  // ── WS-10: malformed JSON in onmessage doesn't crash ──────────────────
  it("WS-10: malformed JSON in onmessage doesn't crash", () => {
    const { result } = renderHook(() => useWebSocket());

    // Send invalid JSON — should be caught internally
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => {
      mockWsInstance.onmessage?.({ data: "not-valid-json{{{" });
    });

    // State should remain unchanged (no crash)
    expect(result.current.telemetry).toBeNull();
    expect(result.current.history.length).toBe(0);
    errorSpy.mockRestore();
  });
});
