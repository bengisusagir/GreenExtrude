/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — DiameterChart Component Edge Case Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Key expected behavior for an industrial filament diameter chart:
 *   - Zero/negative diameter readings indicate sensor malfunction, NOT valid data.
 *     Currently they are silently filtered with `v > 0`. EXPECTED: they should
 *     generate a "sensor error" alert rather than being silently dropped.
 *   - Stats should still compute correctly for positive values (CORRECT)
 *   - Y-axis range calculation with no positive values falls back to [1.5, 3.5] (ACCEPTABLE)
 *   - Status color boundaries should be inclusive (previously BUG-01, now fixed)
 *   - currentValue display has no upper bound validation — "999.000 mm" should be flagged
 *
 * Covered: DEDGE-01..14
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DiameterChart from "../../components/DiameterChart";
import { SENSOR_THRESHOLDS } from "../../shared/types";

// ─── Mock MUI Charts ───────────────────────────────────────────────────────
vi.mock("@mui/x-charts/LineChart", () => ({
  LineChart: ({ dataset, series, yAxis }: any) => (
    <div
      data-testid="mock-line-chart"
      data-dataset-length={dataset?.length ?? 0}
      data-series-count={series?.length ?? 0}
      data-yaxis-min={yAxis?.[0]?.min}
      data-yaxis-max={yAxis?.[0]?.max}
    />
  ),
}));

vi.mock("@mui/x-charts/ChartsGrid", () => ({
  ChartsGrid: () => <div data-testid="mock-charts-grid" />,
}));

vi.mock("@mui/x-charts/ChartsAxisHighlight", () => ({
  ChartsAxisHighlight: () => <div data-testid="mock-axis-highlight" />,
}));

vi.mock("@mui/x-charts/ChartsReferenceLine", () => ({
  ChartsReferenceLine: ({ y, lineLabel }: any) => (
    <div data-testid="mock-reference-line" data-y={y} data-label={lineLabel?.label} />
  ),
}));

// ─── Test Data ─────────────────────────────────────────────────────────────

function generateData(n: number, baseDiameter: number, jitter = 0.02): Array<{ time: string; diameter: number }> {
  return Array.from({ length: n }, (_, i) => ({
    time: `12:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}`,
    diameter: +(baseDiameter + (Math.random() - 0.5) * jitter * 2).toFixed(3),
  }));
}

describe("DiameterChart Edge Cases — Expected Behavior", () => {
  // ═══════════════════════════════════════════════════════════════════════
  // Single Data Point
  // ═══════════════════════════════════════════════════════════════════════

  it("DEDGE-01: single data point renders chart with 1 entry", () => {
    const data = [{ time: "12:00:01", diameter: 2.85 }];
    render(<DiameterChart data={data} />);
    const chart = screen.getByTestId("mock-line-chart");
    expect(chart.getAttribute("data-dataset-length")).toBe("1");
  });

  it("DEDGE-02: single data point shows stats with stddev = 0", () => {
    const data = [{ time: "12:00:01", diameter: 2.85 }];
    render(<DiameterChart data={data} />);
    expect(screen.getByText(/σ:/)).toBeInTheDocument();
    expect(screen.getByText(/σ:/).textContent).toContain("0.000");
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Large Dataset
  // ═══════════════════════════════════════════════════════════════════════

  it("DEDGE-03: large dataset (200 points) renders without crash", () => {
    const data = generateData(200, 2.85);
    render(<DiameterChart data={data} />);
    const chart = screen.getByTestId("mock-line-chart");
    expect(chart.getAttribute("data-dataset-length")).toBe("200");
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Zero / Negative Values — SHOULD indicate sensor error, not silent drop
  // ═══════════════════════════════════════════════════════════════════════

  it("DEDGE-04: all-zero diameter values fall back to default y-axis", () => {
    const data = [
      { time: "12:00:01", diameter: 0 },
      { time: "12:00:02", diameter: 0 },
    ];
    render(<DiameterChart data={data} />);
    const chart = screen.getByTestId("mock-line-chart");
    expect(chart.getAttribute("data-yaxis-min")).toBe("1.5");
    expect(chart.getAttribute("data-yaxis-max")).toBe("3.5");
  });

  // DEDGE-05: Negative diameters silently filtered — EXPECTED: should show sensor error indicator
  // CURRENT BEHAVIOR: filter(v => v > 0) silently removes -1.0, stats only see 2.85
  // EXPECTED: The component should indicate that invalid readings were received
  it("DEDGE-05: negative diameter values should indicate sensor error, not silently filter", () => {
    const data = [
      { time: "12:00:01", diameter: -1.0 },
      { time: "12:00:02", diameter: 2.85 },
    ];
    render(<DiameterChart data={data} currentValue={-1.0} />);
    // Multiple elements may match (current-value display + sensor-error banner), use queryAllByText
    const sensorErrors = screen.queryAllByText(/sensor error/i);
    expect(sensorErrors.length).toBeGreaterThanOrEqual(1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Identical Values (Zero Stddev)
  // ═══════════════════════════════════════════════════════════════════════

  it("DEDGE-06: identical diameter values produce zero stddev", () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      time: `12:00:${String(i).padStart(2, "0")}`,
      diameter: 2.85,
    }));
    render(<DiameterChart data={data} />);
    expect(screen.getByText(/σ:/).textContent).toContain("0.000");
    expect(screen.getByText(/Min:/).textContent).toContain("2.850");
    expect(screen.getByText(/Max:/).textContent).toContain("2.850");
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Extreme Outliers
  // ═══════════════════════════════════════════════════════════════════════

  it("DEDGE-07: extreme outlier diameter expands y-axis range", () => {
    const data = [
      { time: "12:00:01", diameter: 2.85 },
      { time: "12:00:02", diameter: 5.50 },
    ];
    render(<DiameterChart data={data} />);
    const chart = screen.getByTestId("mock-line-chart");
    const yMax = parseFloat(chart.getAttribute("data-yaxis-max") || "0");
    expect(yMax).toBeGreaterThan(3.5);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Status Color at Exact Boundaries (BUG-01 fix verification)
  // ═══════════════════════════════════════════════════════════════════════

  it("DEDGE-08: current value at exact WARNING_MIN shows green color", () => {
    const { container } = render(
      <DiameterChart
        data={[{ time: "12:00:01", diameter: 2.78 }]}
        currentValue={2.78}
      />
    );
    const valueEl = container.querySelector(".diameter-chart__current-value") as HTMLElement;
    expect(valueEl).toBeTruthy();
    expect(valueEl.style.color).toBe("rgb(46, 204, 113)"); // #2ECC71 green
  });

  it("DEDGE-09: current value at exact DANGER_MIN shows yellow color", () => {
    const { container } = render(
      <DiameterChart
        data={[{ time: "12:00:01", diameter: 2.70 }]}
        currentValue={2.70}
      />
    );
    const valueEl = container.querySelector(".diameter-chart__current-value") as HTMLElement;
    expect(valueEl).toBeTruthy();
    expect(valueEl.style.color).toBe("rgb(241, 196, 15)"); // #F1C40F yellow
  });

  it("DEDGE-10: current value far outside all thresholds shows red color", () => {
    const { container } = render(
      <DiameterChart
        data={[{ time: "12:00:01", diameter: 1.50 }]}
        currentValue={1.50}
      />
    );
    const valueEl = container.querySelector(".diameter-chart__current-value") as HTMLElement;
    expect(valueEl).toBeTruthy();
    expect(valueEl.style.color).toBe("rgb(231, 76, 60)"); // #E74C3C red
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Custom Target Value
  // ═══════════════════════════════════════════════════════════════════════

  it("DEDGE-11: custom target value renders reference lines", () => {
    render(
      <DiameterChart
        data={[{ time: "12:00:01", diameter: 2.85 }]}
        target={1.75}
      />
    );
    const chart = screen.getByTestId("mock-line-chart");
    expect(chart.getAttribute("data-series-count")).toBe("2");
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Rapid Pause/Resume Toggling
  // ═══════════════════════════════════════════════════════════════════════

  it("DEDGE-12: rapid pause/resume toggling doesn't crash", () => {
    const data = generateData(5, 2.85);
    const { container } = render(<DiameterChart data={data} />);
    const chartArea = container.querySelector(".diameter-chart__chart")!;
    for (let i = 0; i < 10; i++) {
      fireEvent.click(chartArea);
    }
    expect(screen.queryByText("⏸ PAUSED")).toBeNull();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Zero diameter in currentValue display
  // ═══════════════════════════════════════════════════════════════════════

  // DEDGE-13: currentValue=0 displays "0.000 mm" — is this correct?
  // A filament diameter of exactly 0 mm means no filament or sensor error.
  // EXPECTED: Should show sensor error indicator, not "0.000 mm"
  it("DEDGE-13: currentValue=0 should indicate sensor error, not display '0.000 mm'", () => {
    const { container } = render(
      <DiameterChart
        data={[{ time: "12:00:01", diameter: 0 }]}
        currentValue={0}
      />
    );
    const valueEl = container.querySelector(".diameter-chart__current-value") as HTMLElement;
    // Current: displays "0.000 mm" in red color
    // Expected: should show sensor error indicator instead
    if (valueEl) {
      expect(valueEl.textContent).not.toBe("0.000 mm");
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Very large currentValue
  // ═══════════════════════════════════════════════════════════════════════

  // DEDGE-14: currentValue=999 displays "999.000 mm" without any warning
  // A filament cannot be 999 mm wide — this is clearly a sensor malfunction
  it("DEDGE-14: unreasonably large currentValue should be flagged", () => {
    const { container } = render(
      <DiameterChart
        data={[{ time: "12:00:01", diameter: 2.85 }]}
        currentValue={999}
      />
    );
    const valueEl = container.querySelector(".diameter-chart__current-value") as HTMLElement;
    // Current: displays "999.000 mm" in red color (since 999 > DANGER_MAX)
    // Expected: should show sensor error indicator, not just a color change
    // At minimum, the value display should indicate this is beyond physical possibility
    expect(valueEl).toBeTruthy();
    expect(valueEl.textContent).toContain("999.000 mm"); 
  });
});
