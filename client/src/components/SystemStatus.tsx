import { useTelemetry } from "../context/TelemetryContext";
import { useTelemetryHealth } from "../context/TelemetryHealthContext";
import { useAlerts } from "../hooks/useAlerts";
import "./styles/SystemStatus.sass";

export default function SystemStatus() {
  const { isConnected, deviceStatus, telemetry } = useTelemetry();
  const deviceOnline = deviceStatus?.status === "connected";
  const { isHealthy } = useTelemetryHealth();
  const alerts = useAlerts();
  const DANGER_WINDOW_MS = 2_000; // Consider "danger" alerts active if they occurred within the last 2 seconds 
  const hasDanger = alerts.some(
    a => a.type === "danger" && (Date.now() - a.timestamp) < DANGER_WINDOW_MS
  );

  const lastSync = telemetry?.timestamp
    ? new Date(telemetry.timestamp).toLocaleTimeString()
    : "Never";

  return (
    <div className="system-status glass-card">
      <div className="system-status__header">
        <div className="system-status__title-wrapper">
          <div className="system-status__title-bar"></div>
          <h3 className="system-status__title">SYSTEM STATUS</h3>
        </div>
        <svg
          className="system-status__icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#3AB0FF"
          strokeWidth="2"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      </div>
      <div className="system-status__col">
        <div className="system-status__main-indicator">
          <div
            className={`system-status__circle ${isConnected && deviceOnline ? "system-status__circle--online" : ""
              }`}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="system-status__status-text">
            {isConnected && deviceOnline ? "ONLINE" : "OFFLINE"}
          </div>
          <div className="system-status__last-sync">
            Last Sync: {lastSync}
          </div>
        </div>

        <div className="system-status__list">
          <div className="system-status__item">
            <div className="system-status__item-left">
              <span
                className={`system-status__dot ${isConnected ? "system-status__dot--online" : ""
                  }`}
              />
              <span className="system-status__item-label">Network:</span>
            </div>
            <span
              className={`system-status__item-value ${isConnected ? "system-status__item-value--online" : ""
                }`}
            >
              {isConnected ? "Connected" : "Disconnected"}
            </span>
          </div>

          <div className="system-status__item">
            <div className="system-status__item-left">
              <span
                className={`system-status__dot ${hasDanger || !isHealthy ? "system-status__dot--offline" : "system-status__dot--online"}`}
              />
              <span className="system-status__item-label">Safety:</span>
            </div>
            <span className={`system-status__item-value ${hasDanger || !isHealthy ? "system-status__item-value--offline" : "system-status__item-value--online"}`}>
              {hasDanger ? "Danger" : "OK"}
            </span>
          </div>

          <div className="system-status__item">
            <div className="system-status__item-left">
              <span
                className={`system-status__dot ${isHealthy ? "system-status__dot--online" : "system-status__dot--offline"}`}
              />
              <span className="system-status__item-label">Data Logging:</span>
            </div>
            <span className={`system-status__item-value ${isHealthy ? "system-status__item-value--online" : "system-status__item-value--offline"}`}>

              {isHealthy ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
