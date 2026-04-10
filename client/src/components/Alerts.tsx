/**
 * Alerts.tsx
 * This should be edited to display real alerts from the system, but for now it just shows a static message
 */
import "./styles/Alerts.sass";

interface AlertItem {
  id: string;
  type: "warning" | "danger" | "info";
  message: string;
  timestamp: number;
}

interface AlertsProps {
  alerts?: AlertItem[];
}

const TYPE_CONFIG = {
  warning: { label: "WARN",  bg: "rgba(255,152,0,0.12)",  border: "#ff9800", text: "#ffb74d" },
  danger:  { label: "CRIT",  bg: "rgba(244,67,54,0.12)",  border: "#f44336", text: "#ef9a9a" },
  info:    { label: "INFO",  bg: "rgba(58,176,255,0.12)", border: "#3AB0FF", text: "#90caf9" },
};

export default function Alerts({ alerts = [] }: AlertsProps) {
  const hasAlerts = alerts.length > 0;

  return (
    <div className="alerts glass-card">
      <div className="alerts__header">
        <div className="alerts__title-wrapper">
          <div className="alerts__title-bar"></div>
          <h3 className="alerts__title">ALERTS</h3>
        </div>
        <div className={`alerts__badge ${hasAlerts ? "alerts__badge--active" : ""}`}>
          {hasAlerts ? alerts.length : "—"}
        </div>
      </div>

      <div className="alerts__divider" />

      <div className="alerts__content">
        {!hasAlerts ? (
          <div className="alerts__empty">
            <div className="alerts__empty-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
            <span>All systems nominal</span>
            <span className="alerts__empty-sub">No active alerts</span>
          </div>
        ) : (
          <div className="alerts__list">
            {alerts.map((alert) => {
              const cfg = TYPE_CONFIG[alert.type];
              return (
                <div
                  key={alert.id}
                  className="alerts__item"
                  style={{
                    background: cfg.bg,
                    borderLeft: `3px solid ${cfg.border}`,
                  }}
                >
                  <span
                    className="alerts__item-badge"
                    style={{ color: cfg.text, borderColor: cfg.border }}
                  >
                    {cfg.label}
                  </span>
                  <span className="alerts__item-message">{alert.message}</span>
                  <span className="alerts__item-time">
                    {new Date(alert.timestamp).toLocaleTimeString("en-US", {
                      hour12: false,
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
