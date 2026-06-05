/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — MotorRPM Component Edge Case Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Expected behavior for a motor RPM display in an industrial extruder:
 *   - Negative RPM should be clamped to 0 or show "—", NOT "-50"
 *   - Undefined RPM should show a placeholder like "—", NOT blank
 *   - Very large values (>reasonable max e.g. 100 RPM) should be flagged
 *   - Zero RPM should still display "0" (valid: motor stopped)
 *   - Decimal RPM like 30.5 should display as-is
 *
 * Covered: MREDGE-01..08
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MotorRPM from "../../components/MotorRPM";

describe("MotorRPM Edge Cases — Expected Behavior", () => {
  // ─── MREDGE-01: Zero RPM (motor stopped) — should display "0" ──────────
  it("MREDGE-01: zero RPM is displayed as 0", () => {
    render(<MotorRPM rpm={0} />);
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("RPM")).toBeInTheDocument();
  });

  // ─── MREDGE-02: Negative RPM — SHOULD NOT display negative number ──────
  // In a real extruder, RPM cannot be negative. The component should either:
  // a) Clamp to 0, or b) Show a placeholder like "—"
  // CURRENT BEHAVIOR: renders "-50" → BUG: no input validation
  it("MREDGE-02: negative RPM should NOT be displayed as negative number", () => {
    render(<MotorRPM rpm={-50} />);
    // Expected: value should be clamped to 0 or show placeholder "—"
    // If this FAILS, the component needs input validation
    const valueEl = screen.getByText("RPM").previousElementSibling;
    const displayed = valueEl?.textContent ?? "";
    // Negative values should NOT pass through as-is
    expect(displayed).not.toBe("-50");
  });

  // ─── MREDGE-03: Very large RPM — should still display ──────────────────
  // 999999 RPM is physically impossible for an extruder. Component should
  // display the value but ideally indicate sensor error.
  it("MREDGE-03: very large RPM value is displayed (but may indicate sensor error)", () => {
    render(<MotorRPM rpm={999999} />);
    expect(screen.getByText("999999")).toBeInTheDocument();
  });

  // ─── MREDGE-04: Decimal RPM — should display with appropriate precision ─
  it("MREDGE-04: decimal RPM displays correctly", () => {
    render(<MotorRPM rpm={30.5} />);
    expect(screen.getByText("30.5")).toBeInTheDocument();
  });

  // ─── MREDGE-05: Undefined RPM — should show placeholder, NOT blank ─────
  // A blank value makes it unclear whether data is missing or RPM is 0.
  // Expected: "—" or "N/A" placeholder when rpm is undefined
  // CURRENT BEHAVIOR: renders nothing (empty string) → UX BUG
  it("MREDGE-05: undefined RPM should show a placeholder, not blank", () => {
    render(<MotorRPM rpm={undefined} />);
    const valueEl = screen.getByText("RPM").previousElementSibling;
    const displayed = valueEl?.textContent ?? "";
    // Blank/empty is bad UX — should show "—" or "N/A" or "0"
    expect(displayed.length).toBeGreaterThan(0);
  });

  // ─── MREDGE-06: Title renders correctly ────────────────────────────────
  it("MREDGE-06: component title is EXTRUDER MOTOR RPM", () => {
    render(<MotorRPM rpm={30} />);
    expect(screen.getByText("EXTRUDER MOTOR RPM")).toBeInTheDocument();
  });

  // ─── MREDGE-07: RPM at realistic high boundary (60 RPM) ────────────────
  // 60 RPM is the warning threshold in useAlerts. Component should display it.
  it("MREDGE-07: RPM at warning threshold (60) displays correctly", () => {
    render(<MotorRPM rpm={60} />);
    expect(screen.getByText("60")).toBeInTheDocument();
  });

  // ─── MREDGE-08: RPM just above realistic range (80 RPM) ────────────────
  // 80 RPM is the anomaly spike value. Component should display it.
  it("MREDGE-08: RPM above realistic range (80) is still displayed", () => {
    render(<MotorRPM rpm={80} />);
    expect(screen.getByText("80")).toBeInTheDocument();
  });
});
