/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — TemperatureGauge Component Edge Case Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Expected behavior for an extruder heater temperature gauge:
 *   - Negative temperature should NOT display as negative — heaters can't be below ambient
 *     Either clamp to 0 or show a sensor-error indicator
 *   - Temperature exceeding maxValue should be clamped or show overflow indicator
 *     Gauge value > maxValue is undefined behavior for the gauge library
 *   - Zero temperature should display "0°C" (valid: heater off/cold)
 *   - Integer values display without decimals, decimal values with 1 decimal place
 *   - maxTemp calculation: Math.max(setPoint * 1.2, 250) — correct formula
 *
 * Covered: TGEDGE-01..10
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import TemperatureGauge from "../../components/TemperatureGauge";

// ─── Mock react-gauge-component ─────────────────────────────────────────────
vi.mock("react-gauge-component", () => ({
  default: (props: any) => (
    <div
      data-testid="gauge-component"
      data-value={props.value}
      data-max-value={props.maxValue}
    />
  ),
  __esModule: true,
}));

describe("TemperatureGauge Edge Cases — Expected Behavior", () => {
  // ─── TGEDGE-01: Zero temperature (heater off) — should display "0°C" ────
  it("TGEDGE-01: renders zero temperature correctly", () => {
    render(<TemperatureGauge title="Heater 1" temperature={0} setPoint={200} />);
    expect(screen.getByText("0°C")).toBeInTheDocument();
    expect(screen.getByTestId("gauge-component")).toHaveAttribute("data-value", "0");
  });

  // ─── TGEDGE-02: Negative temperature — SHOULD NOT display as negative ───
  // An extruder heater cannot have a negative temperature. If the sensor reports
  // -10°C, that's a sensor malfunction. The component should NOT render "-10°C".
  // Expected: clamp to 0 or show sensor-error indicator
  // CURRENT BEHAVIOR: renders "-10°C" → BUG: no input validation
  it("TGEDGE-02: negative temperature should NOT display as negative number", () => {
    render(<TemperatureGauge title="Heater 1" temperature={-10} setPoint={200} />);
    // The temperature display should NOT show a negative value
    expect(screen.queryByText("-10°C")).not.toBeInTheDocument();
    // It should either show "0°C" (clamped) or a sensor error indicator
    const gauge = screen.getByTestId("gauge-component");
    const gaugeValue = gauge.getAttribute("data-value");
    expect(Number(gaugeValue)).toBeGreaterThanOrEqual(0);
  });

  // ─── TGEDGE-03: Temperature exceeding maxValue — should be clamped ──────
  // When temperature=999 and maxTemp=250, the gauge receives value=999 with
  // maxValue=250. This is undefined behavior in the gauge library.
  // Expected: temperature should be clamped to maxTemp, or show overflow indicator
  // CURRENT BEHAVIOR: passes 999 to gauge as-is → BUG: no upper bound check
  it("TGEDGE-03: temperature exceeding maxValue should be clamped to maxValue", () => {
    render(<TemperatureGauge title="Heater 1" temperature={999} setPoint={200} />);
    const gauge = screen.getByTestId("gauge-component");
    const gaugeValue = Number(gauge.getAttribute("data-value"));
    const gaugeMax = Number(gauge.getAttribute("data-max-value"));
    // Value should not exceed maxValue — passing value > max is undefined behavior
    expect(gaugeValue).toBeLessThanOrEqual(gaugeMax);
  });

  // ─── TGEDGE-04: Temperature exactly at set point ────────────────────────
  it("TGEDGE-04: temperature exactly at set point displays correctly", () => {
    render(<TemperatureGauge title="Heater 1" temperature={200} setPoint={200} />);
    expect(screen.getByText("200°C")).toBeInTheDocument();
    expect(screen.getByText("Set Point: 200°C")).toBeInTheDocument();
  });

  // ─── TGEDGE-05: Integer temperature displays without decimal ────────────
  it("TGEDGE-05: integer temperature displays without decimal place", () => {
    render(<TemperatureGauge title="Heater 1" temperature={200} setPoint={200} />);
    expect(screen.getByText("200°C")).toBeInTheDocument();
  });

  // ─── TGEDGE-06: Decimal temperature displays with one decimal place ─────
  it("TGEDGE-06: decimal temperature displays with one decimal place", () => {
    render(<TemperatureGauge title="Heater 1" temperature={200.5} setPoint={200} />); 
    expect(screen.getByText("200.5°C")).toBeInTheDocument();
  });

  // ─── TGEDGE-07: Custom unit renders correctly ───────────────────────────
  it("TGEDGE-07: renders with custom unit (°F)", () => {
    render(<TemperatureGauge title="Heater 1" temperature={392} setPoint={392} unit="°F" />);
    expect(screen.getByText("392°F")).toBeInTheDocument();
    expect(screen.getByText("Set Point: 392°F")).toBeInTheDocument();
  });

  // ─── TGEDGE-08: maxTemp calculation with high set point ─────────────────
  it("TGEDGE-08: maxTemp = setPoint*1.2 when setPoint > 208.33", () => {
    render(<TemperatureGauge title="Heater 1" temperature={250} setPoint={250} />);
    // maxTemp = max(250*1.2, 250) = max(300, 250) = 300
    expect(screen.getByTestId("gauge-component")).toHaveAttribute("data-max-value", "300");
  });

  // ─── TGEDGE-09: maxTemp calculation with low set point ──────────────────
  it("TGEDGE-09: maxTemp = 250 when setPoint*1.2 < 250", () => {
    render(<TemperatureGauge title="Heater 1" temperature={180} setPoint={180} />);
    // maxTemp = max(180*1.2, 250) = max(216, 250) = 250
    expect(screen.getByTestId("gauge-component")).toHaveAttribute("data-max-value", "250");
  });

  // ─── TGEDGE-10: Title renders correctly ─────────────────────────────────
  it("TGEDGE-10: title is displayed", () => {
    render(<TemperatureGauge title="Zone 3" temperature={200} setPoint={200} />);
    expect(screen.getByText("Zone 3")).toBeInTheDocument();
  });
});
