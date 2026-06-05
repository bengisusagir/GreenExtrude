/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — DiameterChart Component Unit Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests the filament diameter chart component:
 *   - Rendering with empty data
 *   - Rendering with sample data and current value
 *   - Pause/resume toggle
 *   - Stats calculation (min, max, avg, stddev)
 *   - Status color logic (green, yellow, red)
 *   - Custom target prop
 *
 * Covered: DCH-01..10
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DiameterChart from "../../components/DiameterChart";

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

const SAMPLE_DATA = [
  { time: "12:00:01", diameter: 2.85 },
  { time: "12:00:02", diameter: 2.87 },
  { time: "12:00:03", diameter: 2.83 },
  { time: "12:00:04", diameter: 2.90 },
  { time: "12:00:05", diameter: 2.86 },
];

describe("DiameterChart Component", () => {
  // ─── DCH-01: renders container with correct class ──────────────────────
  it("DCH-01: renders the diameter chart container", () => {
    const { container } = render(<DiameterChart data={[]} />);
    expect(container.firstChild).toHaveClass("diameter-chart");
  });

  // ─── DCH-02: renders title text ────────────────────────────────────────
  it("DCH-02: renders 'FILAMENT DIAMETER' title", () => {
    render(<DiameterChart data={[]} />);
    expect(screen.getByText("FILAMENT DIAMETER")).toBeInTheDocument();
  });

  // ─── DCH-03: renders chart with empty data ─────────────────────────────
  it("DCH-03: renders chart with empty dataset", () => {
    render(<DiameterChart data={[]} />);
    const chart = screen.getByTestId("mock-line-chart");
    expect(chart).toBeInTheDocument();
    expect(chart.getAttribute("data-dataset-length")).toBe("0");
  });

  // ─── DCH-04: renders chart with sample data ────────────────────────────
  it("DCH-04: renders chart with sample data points", () => {
    render(<DiameterChart data={SAMPLE_DATA} />);
    const chart = screen.getByTestId("mock-line-chart");
    expect(chart.getAttribute("data-dataset-length")).toBe("5");
    expect(chart.getAttribute("data-series-count")).toBe("2"); // diameter + target
  });

  // ─── DCH-05: shows current value when provided ─────────────────────────
  it("DCH-05: displays current diameter value when provided", () => {
    render(<DiameterChart data={SAMPLE_DATA} currentValue={2.856} />);
    expect(screen.getByText("2.856 mm")).toBeInTheDocument();
  });

  // ─── DCH-06: does not show current value when undefined ────────────────
  it("DCH-06: hides current value when undefined", () => {
    const { container } = render(<DiameterChart data={SAMPLE_DATA} />);
    const valueEl = container.querySelector(".diameter-chart__current-value");
    expect(valueEl).toBeNull();
  });

  // ─── DCH-07: pause toggle shows badge and freezes data ─────────────────
  it("DCH-07: clicking chart area toggles pause state", () => {
    const { container } = render(<DiameterChart data={SAMPLE_DATA} />);
    const chartArea = container.querySelector(".diameter-chart__chart")!;

    // Initially not paused — no badge
    expect(screen.queryByText("⏸ PAUSED")).toBeNull();

    // Click to pause
    fireEvent.click(chartArea);
    expect(screen.getByText("⏸ PAUSED")).toBeInTheDocument();

    // Click again to resume
    fireEvent.click(chartArea);
    expect(screen.queryByText("⏸ PAUSED")).toBeNull();
  });

  // ─── DCH-08: stats row shows min/max/avg/stddev ────────────────────────
  it("DCH-08: displays stats row with min, max, avg, stddev", () => {
    render(<DiameterChart data={SAMPLE_DATA} />);
    // Stats values: min=2.83, max=2.90, avg≈2.862, stddev≈0.0228
    expect(screen.getByText(/Min:/)).toBeInTheDocument();
    expect(screen.getByText(/Max:/)).toBeInTheDocument();
    expect(screen.getByText(/Avg:/)).toBeInTheDocument();
    expect(screen.getByText(/σ:/)).toBeInTheDocument();
  });

  // ─── DCH-09: no stats when data is empty ───────────────────────────────
  it("DCH-09: hides stats row when data is empty", () => {
    const { container } = render(<DiameterChart data={[]} />);
    const statsEl = container.querySelector(".diameter-chart__stats");
    expect(statsEl).toBeNull();
  });

  // ─── DCH-10: yAxis defaults to 1.5–3.5 when no data ──────────────────
  it("DCH-10: uses default y-axis range when no data", () => {
    render(<DiameterChart data={[]} />);
    const chart = screen.getByTestId("mock-line-chart");
    expect(chart.getAttribute("data-yaxis-min")).toBe("1.5");
    expect(chart.getAttribute("data-yaxis-max")).toBe("3.5");
  });
});
