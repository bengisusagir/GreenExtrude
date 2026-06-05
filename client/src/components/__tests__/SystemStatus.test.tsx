/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — SystemStatus Component Unit Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Covered: CMP-SS-01..05
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SystemStatus from "../../components/SystemStatus";

// ─── Mock hooks ────────────────────────────────────────────────────────────

let mockIsConnected = false;
let mockDeviceStatus: { status: string } | null = null;
let mockIsHealthy = false;
let mockAlerts: { id: string; type: string; message: string; timestamp: number }[] = [];

vi.mock("../../context/TelemetryContext", () => ({
  useTelemetry: () => ({
    isConnected: mockIsConnected,
    deviceStatus: mockDeviceStatus,
    telemetry: null,
    history: [],
    sendCommand: vi.fn(),
  }),
}));

vi.mock("../../context/TelemetryHealthContext", () => ({
  useTelemetryHealth: () => ({
    isHealthy: mockIsHealthy,
    timeoutMs: 2000,
  }),
}));

vi.mock("../../hooks/useAlerts", () => ({
  useAlerts: () => mockAlerts,
}));

describe("SystemStatus Component", () => {
  it("CMP-SS-01: shows OFFLINE when disconnected", () => {
    mockIsConnected = false;
    mockDeviceStatus = null;
    mockIsHealthy = false;
    mockAlerts = [];
    render(<SystemStatus />);
    expect(screen.getByText("OFFLINE")).toBeInTheDocument();
  });

  it("CMP-SS-02: shows ONLINE when connected and device online", () => {
    mockIsConnected = true;
    mockDeviceStatus = { status: "connected" };
    mockIsHealthy = true;
    mockAlerts = [];
    render(<SystemStatus />);
    expect(screen.getByText("ONLINE")).toBeInTheDocument();
  });

  it("CMP-SS-03: shows Network: Connected when isConnected is true", () => {
    mockIsConnected = true;
    mockDeviceStatus = { status: "connected" };
    render(<SystemStatus />);
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("CMP-SS-04: shows Safety: Danger when there are recent danger alerts", () => {
    mockIsConnected = true;
    mockDeviceStatus = { status: "connected" };
    mockIsHealthy = true;
    mockAlerts = [{ id: "d1", type: "danger", message: "Critical!", timestamp: Date.now() }];
    render(<SystemStatus />);
    expect(screen.getByText("Danger")).toBeInTheDocument();
  });

  it("CMP-SS-05: shows Data Logging: Active when healthy", () => {
    mockIsConnected = true;
    mockDeviceStatus = { status: "connected" };
    mockIsHealthy = true;
    mockAlerts = [];
    render(<SystemStatus />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });
});
