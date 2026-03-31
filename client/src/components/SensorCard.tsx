
import "./styles/SensorCard.sass";

type SensorStatus = "normal" | "warning" | "danger";

interface SensorCardProps {
  /** Human-readable label shown above the value, e.g. "Zone 1 — Feed" */
  label: string;

  /** Current reading. Pass "—" when there is no data yet. */
  value: number | string;

  /** Unit label displayed beside the value, e.g. "°C" or "RPM" */
  unit: string;

  /** Visual alert state — defaults to "normal" (no highlight) */
  status?: SensorStatus;
}

export default function SensorCard({ label, value, unit, status = "normal" }: SensorCardProps) {
  // BEM modifier adds a colour class only when the status is not "normal"
  const modifier = status !== "normal" ? `sensor-card--${status}` : "";

  return (
    <div className={`sensor-card ${modifier}`}>
      <div className="sensor-card__label">{label}</div>
      <div className="sensor-card__value">
        {/* Numbers are formatted to 2 decimal places; strings are shown as-is */}
        {typeof value === "number" ? value.toFixed(2) : value}
        <span className="sensor-card__unit">{unit}</span>
      </div>
    </div>
  );
}
