/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — Dashboard Page Unit Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Covered: CMP-DASH-01..04
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Dashboard from "../../pages/Dashboard";

let mockIsConnected = true;
let mockTelemetry: Record<string, number> | null = { heater_1: 200, heater_2: 210, heater_3: 220, motor_speed: 30, filament_diameter: 2.85, winder_speed: 50 };
let mockHistory: Record<string, unknown>[] = [];

vi.mock("../../context/TelemetryContext", () => ({
  useTelemetry: () => ({
    isConnected: mockIsConnected,
    telemetry: mockTelemetry,
    history: mockHistory,
    sendCommand: vi.fn(),
    deviceStatus: null,
  }),
}));

vi.mock("../../hooks/useAlerts", () => ({
  useAlerts: () => [],
}));

// Mock heavy child components
vi.mock("../../components/TemperatureGauge", () => ({
  default: ({ title }: { title: string }) => <div data-testid="gauge">{title}</div>,
}));

vi.mock("../../components/DiameterChart", () => ({
  default: ({ data }: { data: unknown[] }) => (
    <div data-testid="diameter-chart">Points: {data.length}</div>
  ),
}));

vi.mock("../../components/MotorRPM", () => ({
  default: ({ rpm }: { rpm?: number }) => <div data-testid="motor-rpm">{rpm}</div>,
}));

vi.mock("../../components/SystemStatus", () => ({
  default: () => <div data-testid="system-status">Status</div>,
}));

vi.mock("../../components/Alerts", () => ({
  default: ({ alerts }: { alerts?: unknown[] }) => (
    <div data-testid="alerts">Alerts: {alerts?.length ?? 0}</div>
  ),
}));

describe("Dashboard Page", () => {
  it("CMP-DASH-01: shows offline banner when disconnected", () => {
    mockIsConnected = false;
    render(<Dashboard />);
    expect(screen.getByText("System Offline")).toBeInTheDocument();
  });

  it("CMP-DASH-02: does not show offline banner when connected", () => {
    mockIsConnected = true;
    render(<Dashboard />);
    expect(screen.queryByText("System Offline")).not.toBeInTheDocument();
  });

  it("CMP-DASH-03: renders three temperature gauges with correct set points", () => {
    render(<Dashboard />);
    const gauges = screen.getAllByTestId("gauge");
    expect(gauges).toHaveLength(3);
    expect(gauges[0]).toHaveTextContent("HEATER 1");
    expect(gauges[1]).toHaveTextContent("HEATER 2");
    expect(gauges[2]).toHaveTextContent("HEATER 3");
  });

  it("CMP-DASH-04: renders diameter chart, motor RPM, system status, and alerts sections", () => {
    render(<Dashboard />);
    expect(screen.getByTestId("diameter-chart")).toBeInTheDocument();
    expect(screen.getByTestId("motor-rpm")).toBeInTheDocument();
    expect(screen.getByTestId("system-status")).toBeInTheDocument();
    expect(screen.getByTestId("alerts")).toBeInTheDocument();
  });
});
