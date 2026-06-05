/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — TemperatureGauge Component Unit Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Covered: CMP-TG-01..04
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import TemperatureGauge from "../../components/TemperatureGauge";

// Mock react-gauge-component (heavy SVG library)
vi.mock("react-gauge-component", () => ({
  default: ({ value }: { value: number }) => (
    <div data-testid="gauge-mock">Gauge: {value}</div>
  ),
}));

describe("TemperatureGauge Component", () => {
  it("CMP-TG-01: renders the title", () => {
    render(<TemperatureGauge title="HEATER 1" temperature={200} setPoint={220} />);
    expect(screen.getByText("HEATER 1")).toBeInTheDocument();
  });

  it("CMP-TG-02: displays the temperature value", () => {
    render(<TemperatureGauge title="HEATER 1" temperature={198} setPoint={220} />);
    expect(screen.getByText("198°C")).toBeInTheDocument();
  });

  it("CMP-TG-03: displays decimal temperature when not integer", () => {
    render(<TemperatureGauge title="HEATER 1" temperature={198.5} setPoint={220} />);
    expect(screen.getByText("198.5°C")).toBeInTheDocument();
  });

  it("CMP-TG-04: displays set point in footer", () => {
    render(<TemperatureGauge title="HEATER 1" temperature={200} setPoint={220} />);
    expect(screen.getByText(/Set Point: 220°C/)).toBeInTheDocument();
  });
});
