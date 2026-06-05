/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — NavigationBar Component Unit Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests the top navigation bar component:
 *   - Logo rendering ("Green" + "Extrude")
 *   - Navigation links and active state
 *   - onNavigate callback
 *   - Health status dot (online/offline)
 *   - Default activePage prop
 *
 * Covered: NAV-01..07
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NavigationBar from "../../components/NavigationBar";

// ─── Mock TelemetryHealthContext ─────────────────────────────────────────
// NavigationBar uses useTelemetryHealth() for the status indicator.
let mockIsHealthy = false;

vi.mock("../../context/TelemetryHealthContext", () => ({
  useTelemetryHealth: () => ({ isHealthy: mockIsHealthy }),
  recordTelemetryUpdate: vi.fn(),
  TelemetryHealthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockSendCommand = vi.fn();

vi.mock("../../context/TelemetryContext", () => ({
  useTelemetry: () => ({
    isConnected: true,
    sendCommand: mockSendCommand,
    telemetry: null,
    history: [],
    deviceStatus: null,
  }),
}));

describe("NavigationBar Component", () => {
  // ─── NAV-01: renders logo text ─────────────────────────────────────────
  it("NAV-01: renders GreenExtrude logo", () => {
    render(<NavigationBar />);
    expect(screen.getByText("Green")).toBeInTheDocument();
    expect(screen.getByText("Extrude")).toBeInTheDocument();
  });

  // ─── NAV-02: renders Dashboard and Settings links ──────────────────────
  it("NAV-02: renders navigation links", () => {
    render(<NavigationBar />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  // ─── NAV-03: Dashboard is active by default ────────────────────────────
  it("NAV-03: Dashboard link is active by default", () => {
    render(<NavigationBar />);
    const dashboardLink = screen.getByText("Dashboard").closest("a");
    expect(dashboardLink).toHaveClass("nav-bar__link--active");
  });

  // ─── NAV-04: Settings link is active when activePage="settings" ────────
  it("NAV-04: Settings link is active when activePage='settings'", () => {
    render(<NavigationBar activePage="settings" />);
    const settingsLink = screen.getByText("Settings").closest("a");
    expect(settingsLink).toHaveClass("nav-bar__link--active");
  });

  // ─── NAV-05: calls onNavigate when clicking Dashboard ──────────────────
  it("NAV-05: calls onNavigate with 'dashboard' on Dashboard click", () => {
    const onNavigate = vi.fn();
    render(<NavigationBar onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("Dashboard"));
    expect(onNavigate).toHaveBeenCalledWith("dashboard");
  });

  // ─── NAV-06: calls onNavigate when clicking Settings ───────────────────
  it("NAV-06: calls onNavigate with 'settings' on Settings click", () => {
    const onNavigate = vi.fn();
    render(<NavigationBar onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("Settings"));
    expect(onNavigate).toHaveBeenCalledWith("settings");
  });

  // ─── NAV-07: shows ONLINE status when healthy ──────────────────────────
  it("NAV-07: shows LIVE status when isHealthy is true", () => {
    mockIsHealthy = true;
    render(<NavigationBar />);
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    mockIsHealthy = false; // reset
  });

  // ─── NAV-08: shows OFFLINE status when not healthy ─────────────────────
  it("NAV-08: shows OFFLINE status when isHealthy is false", () => {
    mockIsHealthy = false;
    render(<NavigationBar />);
    expect(screen.getByText("OFFLINE")).toBeInTheDocument();
  });

  // ─── NAV-09: renders START and STOP buttons ─────────────────────────
  it("NAV-09: renders START and STOP control buttons", () => {
    render(<NavigationBar />);
    expect(screen.getByText("▶ START")).toBeInTheDocument();
    expect(screen.getByText("■ STOP")).toBeInTheDocument();
  });

  // ─── NAV-10: START button calls sendCommand ───────────────────────────
  it("NAV-10: START button sends START command", () => {
    render(<NavigationBar />);
    fireEvent.click(screen.getByText("▶ START"));
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: "START" })
    );
  });

  // ─── NAV-11: STOP button calls sendCommand ──────────────────────────
  it("NAV-11: STOP button sends EMERGENCY_STOP command", () => {
    render(<NavigationBar />);
    fireEvent.click(screen.getByText("■ STOP"));
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: "EMERGENCY_STOP" })
    );
  });

  // ─── NAV-12: renders Quality button ───────────────────────────────────
  it("NAV-12: renders Quality report button", () => {
    render(<NavigationBar />);
    expect(screen.getByText(/Report/)).toBeInTheDocument();
  });
});
