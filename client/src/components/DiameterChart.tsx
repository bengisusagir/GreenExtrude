
import { useMemo } from "react";
import { LineChart } from "@mui/x-charts/LineChart";
import { ChartsGrid } from "@mui/x-charts/ChartsGrid";
import { ChartsAxisHighlight } from "@mui/x-charts/ChartsAxisHighlight";
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

  const chartData = data.map((item, index) => ({
    id: index,
    time: item.time,
    diameter: item.diameter,
    target: target,
  }));

  const yAxisRange = useMemo(() => {
    if (data.length === 0) {
      return { min: 1.5, max: 3.5 };
    }
    const diameters = data.map((d) => d.diameter).filter((v) => v > 0);
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
  }, [data]);

  return (
    <div className="diameter-chart glass-card">
      <div className="diameter-chart__header">
        <div className="diameter-chart__title-wrapper">
          <div className="diameter-chart__title-bar"></div>
          <h3 className="diameter-chart__title">FILAMENT DIAMETER</h3>
        </div>
        {currentValue !== undefined && (
          <div className="diameter-chart__current-value">
            {currentValue.toFixed(3)} mm
          </div>
        )}
      </div>

      <div className="diameter-chart__chart">
        <div className="diameter-chart__chart-container">
          <LineChart
            height={300}
            dataset={chartData}
            slotProps={{
              legend:{
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
                showMark: true,
                curve: "linear",
                valueFormatter: (value: number | null) =>
                  value == null ? "" : `${value.toFixed(5)} mm`,
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
          </LineChart>
        </div>
      </div>
    </div>
  );
}
