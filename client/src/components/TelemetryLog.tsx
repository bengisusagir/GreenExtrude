/**
 * Each row = one MQTT message published by the device (every ~2 seconds from the simulator).
 * The table is read-only; users cannot edit values here.
 *
 * Reads `history` from TelemetryContext — no props required.
 */

import { useTelemetry } from "../context/TelemetryContext";
import "./styles/TelemetryLog.sass";

export default function TelemetryLog() {
  const { history } = useTelemetry();

  return (
    <div className="telemetry-log">
      <h2 className="telemetry-log__title">Telemetry Log</h2>

      {history.length === 0 ? (
        <p className="telemetry-log__empty">Waiting for data...</p>
      ) : (
        <table className="telemetry-log__table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Zone 1</th>
              <th>Zone 2</th>
              <th>Zone 3</th>
              <th>Motor</th>
              <th>⌀ mm</th>
              <th>Winder</th>
            </tr>
          </thead>
          <tbody>
            {/* Spread + reverse so we don't mutate the original array in state */}
            {[...history].reverse().map((row, i) => (
              <tr key={i}>
                <td>
                  {row.timestamp
                    ? new Date(row.timestamp).toLocaleTimeString()
                    : "—"}
                </td>
                <td>{row.temperature_zone1?.toFixed(1)}°</td>
                <td>{row.temperature_zone2?.toFixed(1)}°</td>
                <td>{row.temperature_zone3?.toFixed(1)}°</td>
                <td>{row.motor_speed?.toFixed(1)}</td>
                <td>{row.filament_diameter?.toFixed(2)}</td>
                <td>{row.winder_speed?.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
