/**
 * Dashboard.tsx
 * ─────────────
 * The main (and only) page of the GreenExtrude monitoring app.
 *
 * Layout
 * ──────
 *   ┌──────────────────────────────────────────────────────┐
 *   │  [Zone 1]  [Zone 2]  [Zone 3]  [Motor]  [⌀]  [Wind] │  ← sensor grid
 *   ├──────────────────────┬───────────────────────────────┤
 *   │   Machine Control    │       Telemetry Log           │  ← controls row
 *   └──────────────────────┴───────────────────────────────┘
 *
 * Data comes from TelemetryContext — no props needed.
 * Alert colours are calculated by the helpers in utils/thresholds.ts.
 */

import SensorCard from "../components/SensorCard";
import ControlPanel from "../components/ControlPanel";
import TelemetryLog from "../components/TelemetryLog";
import { useTelemetry } from "../context/TelemetryContext";

type SensorStatus = "normal" | "warning" | "danger";

function getTempStatus(temp: number | undefined): SensorStatus {
  if (temp === undefined) return "normal";
  if (temp > 230) return "danger";
  if (temp > 215) return "warning";
  return "normal";
}

function getDiameterStatus(d: number | undefined): SensorStatus {
  if (d === undefined) return "normal";
  if (d < 2.70 || d > 3.00) return "danger";
  if (d < 2.78 || d > 2.92) return "warning";
  return "normal";
}

export default function Dashboard() {
  const { telemetry, isConnected } = useTelemetry();

  return (
    <main className="dashboard__content">

      {/* ── Offline Banner ───────────────────────────────────────────────────
          Shown when the WebSocket to the server is closed.
          isConnected becomes false within seconds of losing the connection. */}
      {!isConnected && (
        <div className="dashboard__offline-banner">
          ⚠ System Offline — Dashboard cannot reach the server. Data may be buffered locally.
        </div>
      )}

      {/* ── Sensor Cards ─────────────────────────────────────────────────────
          Each card shows one live reading.
          The `status` prop controls the card's border/background colour:
            "normal"  → default  (no highlight)
            "warning" → orange   (approaching limit)
            "danger"  → red      (outside safe range) */}
      <section className="dashboard__sensors">

        <SensorCard
          label="Zone 1 — Feed"
          value={telemetry?.temperature_zone1 ?? "—"}
          unit="°C"
          status={getTempStatus(telemetry?.temperature_zone1)}
        />

        <SensorCard
          label="Zone 2 — Melt"
          value={telemetry?.temperature_zone2 ?? "—"}
          unit="°C"
          status={getTempStatus(telemetry?.temperature_zone2)}
        />

        <SensorCard
          label="Zone 3 — Nozzle"
          value={telemetry?.temperature_zone3 ?? "—"}
          unit="°C"
          status={getTempStatus(telemetry?.temperature_zone3)}
        />

        <SensorCard
          label="Motor Speed"
          value={telemetry?.motor_speed ?? "—"}
          unit="RPM"
          /* No thresholds defined for motor speed yet */
        />

        <SensorCard
          label="Filament Diameter"
          value={telemetry?.filament_diameter ?? "—"}
          unit="mm"
          status={getDiameterStatus(telemetry?.filament_diameter)}
        />

        <SensorCard
          label="Winder Speed"
          value={telemetry?.winder_speed ?? "—"}
          unit="RPM"
          /* No thresholds defined for winder speed yet */
        />

      </section>

      {/* ── Controls Row ─────────────────────────────────────────────────────
          Left  → ControlPanel  (START / STOP / EMERGENCY STOP buttons)
          Right → TelemetryLog  (scrollable table of recent readings) */}
      <section className="dashboard__controls-row">
        <ControlPanel />
        <TelemetryLog />
      </section>

    </main>
  );
}
