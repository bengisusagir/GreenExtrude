import GaugeComponent from "react-gauge-component";
import "./styles/TemperatureGauge.sass";

interface TemperatureGaugeProps {
  title: string;
  temperature: number;
  setPoint: number;
  unit?: string;
}

export default function TemperatureGauge({
  title,
  temperature,
  setPoint,
  unit = "°C",
}: TemperatureGaugeProps) {
  // Calculate max temperature based on set point with some buffer
  const maxTemp = Math.max(setPoint * 1.2, 250);

  // Calculate set point position for outer indicator (gauge is from 9 o'clock to 3 o'clock, 180 degrees)
  // Normalize set point to 0-1 range, then map to gauge angles
  const setPointRatio = setPoint / maxTemp;
  // Gauge span is 180 degrees (from 9 o'clock to 3 o'clock), centered at 12 o'clock
  const gaugeAngle = setPointRatio * 180;
  // Convert to rotation for positioning on outer circle
  const setPointRotation = (gaugeAngle - 90) * (Math.PI / 180);
  const radius = 110; // Outer radius for the indicator

  return (
    <div className="temp-gauge glass-card">
      <div className="temp-gauge__title">{title}</div>

      <div className="temp-gauge__gauge-wrapper">
        <GaugeComponent
          value={temperature}
          arc={{
            nbSubArcs: 100,
            colorArray: ["#FF6B35", "#FFB347", "#2ECC71"],
            width: 0.2,
            padding: 0,
            cornerRadius: 0,
          }}
          labels={{
            valueLabel: {
              formatTextValue: () => "",
            },
          }}
          maxValue={maxTemp}
          startAngle={-135}
          endAngle={135}
          pointer={{ type: "needle", length: 0.8, width: 8 }}
          type="grafana"
        />
        <div className="temp-gauge__value">
          {Number.isInteger(temperature) ? temperature : temperature.toFixed(1)}
          {unit}
        </div>
      </div>

      <div className="temp-gauge__footer">
        Set Point: {setPoint}
        {unit}
      </div>
    </div>
  );
}
