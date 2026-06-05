/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — Alerts Component Unit Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Covered: CMP-ALR-01..05
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Alerts from "../../components/Alerts";

const SAMPLE_ALERTS = [
  { id: "a1", type: "danger" as const, message: "Zone 1 critical: 240°C", timestamp: Date.now() },
  { id: "a2", type: "warning" as const, message: "Filament drifting: 2.76mm", timestamp: Date.now() },
  { id: "a3", type: "info" as const, message: "System started", timestamp: Date.now() },
];

describe("Alerts Component", () => {
  it("CMP-ALR-01: shows 'All systems nominal' when no alerts", () => {
    render(<Alerts alerts={[]} />);
    expect(screen.getByText("All systems nominal")).toBeInTheDocument();
  });

  it("CMP-ALR-02: renders alert count badge when alerts exist", () => {
    render(<Alerts alerts={SAMPLE_ALERTS} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("CMP-ALR-03: renders em dash badge when no alerts", () => {
    render(<Alerts alerts={[]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("CMP-ALR-04: renders each alert message", () => {
    render(<Alerts alerts={SAMPLE_ALERTS} />);
    expect(screen.getByText(/Zone 1 critical/)).toBeInTheDocument();
    expect(screen.getByText(/Filament drifting/)).toBeInTheDocument();
    expect(screen.getByText(/System started/)).toBeInTheDocument();
  });

  it("CMP-ALR-05: applies correct type labels (CRIT, WARN, INFO)", () => {
    render(<Alerts alerts={SAMPLE_ALERTS} />);
    expect(screen.getByText("CRIT")).toBeInTheDocument();
    expect(screen.getByText("WARN")).toBeInTheDocument();
    expect(screen.getByText("INFO")).toBeInTheDocument();
  });
});
