
import { useTelemetry } from "../context/TelemetryContext";
import "./styles/StatusBar.sass";

export default function StatusBar() {
  const { isConnected, deviceStatus } = useTelemetry();

  // True when the physical device (or simulator) has an active MQTT session.
  const deviceOnline = deviceStatus?.status === "connected";

  return (
    <header className="status-bar">
      <div className="status-bar__left">
        <h1 className="status-bar__title">GreenExtrude</h1>

        {/* WebSocket: browser ↔ Node server */}
        <div className="status-bar__indicator">
          <span
            className={`status-bar__indicator-dot ${
              isConnected ? "status-bar__indicator-dot--online" : ""
            }`}
          />
          {isConnected ? "Server Online" : "Server Offline"}
        </div>

        {/* MQTT: ESP32 / simulator ↔ Node server */}
        <div className="status-bar__indicator">
          <span
            className={`status-bar__indicator-dot ${
              deviceOnline ? "status-bar__indicator-dot--online" : ""
            }`}
          />
          {deviceOnline ? "Device Connected" : "Device Disconnected"}
        </div>
      </div>

      {/* Show the MQTT client ID when a device is connected */}
      {deviceStatus?.clientId && (
        <span className="status-bar__device">Device: {deviceStatus.clientId}</span>
      )}
    </header>
  );
}
