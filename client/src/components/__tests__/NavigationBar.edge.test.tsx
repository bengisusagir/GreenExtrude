/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — NavigationBar Component Edge Case Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests are written for the EXPECTED behavior, not the current implementation.
 * Any test that FAILS indicates a gap in the production code that should be fixed.
 *
 * NavigationBar is primarily a display/navigation component. Most of its
 * behavior is straightforward. The key edge cases are:
 *   - OFFLINE/LIVE toggle based on telemetry health
 *   - Navigation callback safety when undefined
 *   - Active page highlighting
 *   - The distinction between "data stale" vs "disconnected" is NOT surfaced
 *     here — it comes from TelemetryHealthContext. The nav bar only sees
 *     isHealthy=true/false which collapses these two states.
 *
 * Covered: NEDGE-01..10
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NavigationBar from "../../components/NavigationBar";

// ─── Mock TelemetryHealthContext ─────────────────────────────────────────
let mockIsHealthy = false;

vi.mock("../../context/TelemetryHealthContext", () => ({
  useTelemetryHealth: () => ({ isHealthy: mockIsHealthy }),
  recordTelemetryUpdate: vi.fn(),
  TelemetryHealthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("NavigationBar Edge Cases — Expected Behavior", () => {
  beforeEach(() => {
    mockIsHealthy = false;
  });

  // ─── NEDGE-01: OFFLINE when isHealthy=false ────────────────────────────
  it("NEDGE-01: shows OFFLINE when isHealthy=false", () => {
    render(<NavigationBar />);
    expect(screen.getByText("OFFLINE")).toBeInTheDocument();
  });

  // ─── NEDGE-02: LIVE when isHealthy=true ───────────────────────────────
  it("NEDGE-02: shows LIVE when isHealthy=true", () => {
    mockIsHealthy = true;
    render(<NavigationBar />);
    expect(screen.getByText("LIVE")).toBeInTheDocument();
  });

  // ─── NEDGE-03: Status dot styling reflects health ──────────────────────
  it("NEDGE-03: status dot has online class when healthy", () => {
    mockIsHealthy = true;
    render(<NavigationBar />);
    const dot = document.querySelector(".nav-bar__status-dot--online");
    expect(dot).toBeTruthy();
  });

  // ─── NEDGE-04: Rapid navigation clicks fire all callbacks ──────────────
  it("NEDGE-04: rapid navigation clicks fire all callbacks", () => {
    const onNavigate = vi.fn();
    render(<NavigationBar onNavigate={onNavigate} />);
    const dashboardLink = screen.getByText("Dashboard");
    const settingsLink = screen.getByText("Settings");
    fireEvent.click(dashboardLink);
    fireEvent.click(settingsLink);
    fireEvent.click(dashboardLink);
    expect(onNavigate).toHaveBeenCalledTimes(3);
    expect(onNavigate).toHaveBeenNthCalledWith(1, "dashboard");
    expect(onNavigate).toHaveBeenNthCalledWith(2, "settings");
    expect(onNavigate).toHaveBeenNthCalledWith(3, "dashboard");
  });

  // ─── NEDGE-05: No crash when onNavigate is undefined ───────────────────
  it("NEDGE-05: no crash when onNavigate is undefined and link clicked", () => {
    expect(() => {
      render(<NavigationBar onNavigate={undefined} />);
      fireEvent.click(screen.getByText("Dashboard"));
    }).not.toThrow();
  });

  // ─── NEDGE-06: Both nav links always present ───────────────────────────
  it("NEDGE-06: both links exist even with no props", () => {
    render(<NavigationBar />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Green")).toBeInTheDocument();
    expect(screen.getByText("Extrude")).toBeInTheDocument();
  });

  // ─── NEDGE-07: Links use '#' href preventing actual navigation ─────────
  it("NEDGE-07: link href is '#' preventing page navigation", () => {
    render(<NavigationBar />);
    const links = screen.getAllByRole("link");
    links.forEach((link) => {
      expect(link).toHaveAttribute("href", "#");
    });
  });

  // ─── NEDGE-08: Status text styling reflects health ─────────────────────
  it("NEDGE-08: status text has online class when healthy", () => {
    mockIsHealthy = true;
    render(<NavigationBar />);
    const textEl = document.querySelector(".nav-bar__status-text--online");
    expect(textEl).toBeTruthy();
    expect(textEl?.textContent).toBe("LIVE");
  });

  // ─── NEDGE-09: Dashboard link active by default ────────────────────────
  it("NEDGE-09: Dashboard link is active by default (activePage defaults to 'dashboard')", () => {
    render(<NavigationBar />);
    const dashboardLink = screen.getByText("Dashboard").closest("a");
    expect(dashboardLink?.className).toContain("nav-bar__link--active");
  });

  // ─── NEDGE-10: Settings link active when specified ─────────────────────
  it("NEDGE-10: Settings link is active when activePage='settings'", () => {
    render(<NavigationBar activePage="settings" />);
    const settingsLink = screen.getByText("Settings").closest("a");
    expect(settingsLink?.className).toContain("nav-bar__link--active");
    // Dashboard should NOT be active
    const dashboardLink = screen.getByText("Dashboard").closest("a");
    expect(dashboardLink?.className).not.toContain("nav-bar__link--active");
  });
});
