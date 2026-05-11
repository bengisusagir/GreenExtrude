
import { useMemo, useState, useRef, useCallback } from "react";
import { LineChart } from "@mui/x-charts/LineChart";
import { ChartsGrid } from "@mui/x-charts/ChartsGrid";
import { ChartsAxisHighlight } from "@mui/x-charts/ChartsAxisHighlight";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";
import { SENSOR_THRESHOLDS } from "../shared/types";
import "./styles/DiameterChart.sass";

interface DiameterChartProps {
  data: Array<{ time: string; diameter: number }>;
  currentValue?: number;
  target?: number;
}

export default function DiameterChart({
  data,
  currentValue,
  target = SENSOR_THRESHOLDS.FILAMENT_DIAMETER.TARGET,
}: DiameterChartProps) {
  const [paused, setPaused] = useState(false);
  const frozenDataRef = useRef(data);

  const togglePause = useCallback(() => {
    setPaused((prev) => {
      if (!prev) frozenDataRef.current = data;
      return !prev;
    });
  }, [data]);

  const displayData = paused ? frozenDataRef.current : data;

  const chartData = useMemo(() => {
    return displayData.map((item, index) => ({
      id: index,
      time: item.time,
      diameter: item.diameter,
      target: target,
    }));
  }, [displayData, target]);

  const yAxisRange = useMemo(() => {
    if (displayData.length === 0) {
      return { min: 1.5, max: 3.5 };
    }
    const diameters = displayData.map((d) => d.diameter).filter((v) => v > 0);
    if (diameters.length === 0) {
      return { min: 1.5, max: 3.5 };
    }
    const min = Math.min(...diameters);
    const max = Math.max(...diameters);
    const padding = Math.max((max - min) * 0.3, 0.2);
    return {
      min: Math.floor((min - padding) * 10) / 10,
      max: Math.ceil((max + padding) * 10) / 10,
    };
  }, [displayData]);

  // Stats summary
  const stats = useMemo(() => {
    const diameters = displayData.map((d) => d.diameter).filter((v) => v > 0);
    if (diameters.length === 0) return null;
    const min = Math.min(...diameters);
    const max = Math.max(...diameters);
    const avg = diameters.reduce((a, b) => a + b, 0) / diameters.length;
    const stddev = Math.sqrt(
      diameters.reduce((sum, v) => sum + (v - avg) ** 2, 0) / diameters.length
    );
    return { min, max, avg, stddev };
  }, [displayData]);

  // Color-coded current value
  const getStatusColor = (value: number | undefined) => {
    if (value === undefined) return "#FFFFFF";
    if (value >= SENSOR_THRESHOLDS.FILAMENT_DIAMETER.WARNING_MIN &&
        value <= SENSOR_THRESHOLDS.FILAMENT_DIAMETER.WARNING_MAX)
      return "#2ECC71"; // green
    if (value >= SENSOR_THRESHOLDS.FILAMENT_DIAMETER.DANGER_MIN &&
        value <= SENSOR_THRESHOLDS.FILAMENT_DIAMETER.DANGER_MAX)
      return "#F1C40F"; // yellow
    return "#E74C3C"; // red
  };

  return (
    <div className="diameter-chart glass-card">
      <div className="diameter-chart__header">
        <div className="diameter-chart__title-wrapper">
          <div className="diameter-chart__title-bar"></div>
          <h3 className="diameter-chart__title">FILAMENT DIAMETER</h3>
          {paused && <span className="diameter-chart__pause-badge">⏸ PAUSED</span>}
        </div>
        {currentValue !== undefined && (
          <div
            className="diameter-chart__current-value"
            style={{ color: getStatusColor(currentValue) }}
          >
            {currentValue.toFixed(3)} mm
          </div>
        )}
      </div>

      <div
        className="diameter-chart__chart"
        onClick={togglePause}
        style={{ cursor: "pointer", userSelect: "none" }}
        title={paused ? "Click to resume" : "Click to pause"}
      >
        <div className="diameter-chart__chart-container">
          <LineChart
            height={300}
            dataset={chartData}
            slotProps={{
              legend: {
                sx: {
                  color: "#FFFFFF",
                },
              },
            }}
            series={[
              {
                type: "line",
                id: "diameter",
                dataKey: "diameter",
                label: "Diameter",
                color: "#2ECC71",
                showMark: false,
                curve: "catmullRom",
                valueFormatter: (value: number | null) =>
                  value == null ? "" : `${value.toFixed(3)} mm`,
              },
              {
                type: "line",
                id: "target",
                dataKey: "target",
                label: "Target",
                color: "#3AB0FF",
                showMark: false,
                curve: "linear",
              },
            ]}
            xAxis={[
              {
                scaleType: "point",
                dataKey: "id",
                tickNumber: 5,
                label: "Time",
                valueFormatter: (value: number) =>
                  chartData[Math.round(value)]?.time ?? "",
              },
            ]}
            yAxis={[
              {
                min: yAxisRange.min,
                max: yAxisRange.max,
                label: "Diameter (mm)",
              },
            ]}
            sx={{
              ".MuiChartsAxis-line": {
                stroke: "#FFFFFF !important",
                strokeWidth: 1,
              },
              ".MuiChartsAxis-tickLabel": {
                fill: "#FFFFFF !important",
              },
              ".MuiChartsAxis-label": {
                fill: "#FFFFFF !important",
              },
              ".MuiChartsAxisHighlight-x": {
                stroke: "#3AB0FF",
                strokeDasharray: "5 5",
              },
              ".MuiChartsGrid-line": {
                stroke: "#2A3448",
                opacity: 0.3,
              },
              ".MuiChartsLegend-label": {
                fill: "#FFFFFF !important",
              },
              ".MuiLineElement-root": {
                strokeWidth: 2,
              },
              ".MuiMarkElement-root": {
                fill: "#2ECC71",
                stroke: "#1A2035",
                strokeWidth: 2,
                r: 4,
              },
            }}
          >
            <ChartsGrid horizontal vertical />
            <ChartsAxisHighlight x="line" />
            <ChartsReferenceLine
              y={SENSOR_THRESHOLDS.FILAMENT_DIAMETER.WARNING_MAX}
              label={""}
              lineLabel={{
                labelPlacement: "right",
                label: `+0.07 (warn)`,
                style: { fill: "#F1C40F", fontSize: 10 },
              }}
              line={{ stroke: "#F1C40F", strokeDasharray: "6 4", strokeWidth: 1 }}
            />
            <ChartsReferenceLine
              y={SENSOR_THRESHOLDS.FILAMENT_DIAMETER.WARNING_MIN}
              label={""}
              lineLabel={{
                labelPlacement: "right",
                label: `-0.07 (warn)`,
                style: { fill: "#F1C40F", fontSize: 10 },
              }}
              line={{ stroke: "#F1C40F", strokeDasharray: "6 4", strokeWidth: 1 }}
            />
          </LineChart>
        </div>
      </div>

      {stats && (
        <div className="diameter-chart__stats">
          <span>Min: {stats.min.toFixed(3)}</span>
          <span>Max: {stats.max.toFixed(3)}</span>
          <span>Avg: {stats.avg.toFixed(3)}</span>
          <span>σ: {stats.stddev.toFixed(3)}</span>
        </div>
      )}
    </div>
  );
}
