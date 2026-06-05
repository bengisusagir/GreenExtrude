/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — TelemetryHealthContext Unit Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests the health monitoring logic:
 *   - isHealthy starts as false (no telemetry yet)
 *   - isHealthy becomes true after recordTelemetryUpdate() within timeout
 *   - isHealthy becomes false after timeoutMs without updates
 *   - Custom timeoutMs is respected
 *
 * Covered: HLTH-01..06
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  TelemetryHealthProvider,
  useTelemetryHealth,
  recordTelemetryUpdate,
} from "../../context/TelemetryHealthContext";

// Need to also mock useWebSocket since TelemetryProvider wraps it
vi.mock("../../hooks/useWebSocket", () => ({
  useWebSocket: () => ({
    telemetry: null,
    history: [],
    deviceStatus: null,
    isConnected: false,
    sendCommand: vi.fn(),
  }),
}));

function renderUseTelemetryHealth(timeoutMs?: number) {
  return renderHook(() => useTelemetryHealth(), {
    wrapper: ({ children }) => (
      <TelemetryHealthProvider timeoutMs={timeoutMs}>
        {children}
      </TelemetryHealthProvider>
    ),
  });
}

describe("TelemetryHealthContext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("HLTH-01: isHealthy is false when no telemetry has been received", () => {
    const { result } = renderUseTelemetryHealth();
    expect(result.current.isHealthy).toBe(false);
  });

  it("HLTH-02: isHealthy becomes true after recordTelemetryUpdate()", () => {
    const { result } = renderUseTelemetryHealth();
    act(() => { recordTelemetryUpdate(); });
    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current.isHealthy).toBe(true);
  });

  it("HLTH-03: isHealthy becomes false after timeoutMs without updates", () => {
    const { result } = renderUseTelemetryHealth(2000);
    act(() => { recordTelemetryUpdate(); });
    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current.isHealthy).toBe(true);

    // Advance past the 2s timeout + the 500ms check interval
    act(() => { vi.advanceTimersByTime(2500); });
    expect(result.current.isHealthy).toBe(false);
  });

  it("HLTH-04: isHealthy stays true if updates keep arriving within timeout", () => {
    const { result } = renderUseTelemetryHealth(2000);
    act(() => { recordTelemetryUpdate(); });
    act(() => { vi.advanceTimersByTime(0); });

    // Send updates every 1s for 5s
    for (let i = 0; i < 5; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
        recordTelemetryUpdate();
      });
    }

    expect(result.current.isHealthy).toBe(true);
  });

  it("HLTH-05: custom timeoutMs is respected (e.g. 5000ms)", () => {
    const { result } = renderUseTelemetryHealth(5000);
    act(() => { recordTelemetryUpdate(); });
    act(() => { vi.advanceTimersByTime(0); });

    // After 3s — still healthy (within 5s window)
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.isHealthy).toBe(true);

    // After 6s total — unhealthy
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.isHealthy).toBe(false);
  });

  it("HLTH-06: timeoutMs value is exposed in context", () => {
    const { result } = renderUseTelemetryHealth(3500);
    expect(result.current.timeoutMs).toBe(3500);
  });
});
