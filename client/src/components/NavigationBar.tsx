import { useState, useMemo, useCallback } from "react";
import { useTelemetryHealth } from "../context/TelemetryHealthContext";
import { useTelemetry } from "../context/TelemetryContext";
import { computeQualityStats, toHtmlTable, downloadHtmlAsXls } from "../utils/reportExport";
import "./styles/NavigationBar.sass";

interface NavigationBarProps {
  activePage?: "dashboard" | "settings";
  onNavigate?: (page: "dashboard" | "settings") => void;
}

const API_BASE = process.env.REACT_APP_API_BASE_URL || "";

export default function NavigationBar({
  activePage = "dashboard",
  onNavigate,
}: NavigationBarProps) {
  const { isHealthy } = useTelemetryHealth();
  const { isConnected, sendCommand, history } = useTelemetry();
  const [showReport, setShowReport] = useState(false);

  const stats = useMemo(() => computeQualityStats(history), [history]);

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    page: "dashboard" | "settings"
  ) => {
    e.preventDefault();
    setShowReport(false);
    onNavigate?.(page);
  };

  const handleStart = () => {
    sendCommand({ type: "START", timestamp: new Date().toISOString() });
  };

  const handleEmergencyStop = () => {
    sendCommand({ type: "EMERGENCY_STOP", timestamp: new Date().toISOString() });
  };

  const handleExportReport = useCallback(async () => {
    if (!stats || history.length === 0) return;
    try {
      const res = await fetch(`${API_BASE}/api/telemetry?limit=500`);
      if (res.ok) {
        const json = await res.json();
        const allData = (json.data ?? []) as import("../shared/types").TelemetryData[];
        if (allData.length > 0) {
          const reStats = computeQualityStats(allData);
          if (reStats) {
            const html = toHtmlTable(allData, reStats);
            const ts = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
            downloadHtmlAsXls(html, `greenextrude-report_${ts}.xls`);
            return;
          }
        }
      }
    } catch {
    }
    const html = toHtmlTable(history, stats);
    const ts = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
    downloadHtmlAsXls(html, `greenextrude-report_${ts}.xls`);
  }, [history, stats]);

  return (
    <header className="nav-bar">
      <div className="nav-bar__logo">
        <span className="nav-bar__logo-green">Green</span>
        <span className="nav-bar__logo-white">Extrude</span>
      </div>

      <nav className="nav-bar__nav">
        <a
          href="#"
          className={`nav-bar__link ${
            activePage === "dashboard" ? "nav-bar__link--active" : ""
          }`}
          onClick={(e) => handleNavClick(e, "dashboard")}
        >
          Dashboard
        </a>
        <a
          href="#"
          className={`nav-bar__link ${
            activePage === "settings" ? "nav-bar__link--active" : ""
          }`}
          onClick={(e) => handleNavClick(e, "settings")}
        >
          Settings
        </a>
      </nav>

      <div className="nav-bar__actions">
        <button
          className="nav-bar__ctrl-btn nav-bar__ctrl-btn--start"
          onClick={handleStart}
          disabled={!isConnected}
          title="Start extrusion"
        >
          ▶ START
        </button>
        <button
          className="nav-bar__ctrl-btn nav-bar__ctrl-btn--estop"
          onClick={handleEmergencyStop}
          disabled={!isConnected}
          title="Emergency stop"
        >
          ■ STOP
        </button>

        <div className="nav-bar__report-wrapper">
          <button
            className="nav-bar__report-btn"
            onClick={() => setShowReport(!showReport)}
            disabled={!stats}
            title="Filament quality report"
          >
          Report {showReport ? " ▲" : " ▼"}
          </button>

          {showReport && stats && (
            <div className="nav-bar__report-dropdown">
              <div className="nav-bar__report-header">
                Filament Quality Report
              </div>
              <div className="nav-bar__report-row">
                <span>Readings</span>
                <span className="nav-bar__report-val">{stats.n} / {history.length}</span>
              </div>
              <div className="nav-bar__report-row">
                <span>Mean Ø</span>
                <span className="nav-bar__report-val">{stats.mean.toFixed(3)} mm</span>
              </div>
              <div className="nav-bar__report-row">
                <span>Std Dev</span>
                <span className="nav-bar__report-val">±{stats.stdDev.toFixed(4)} mm</span>
              </div>
              <div className="nav-bar__report-row">
                <span>Min Ø</span>
                <span className="nav-bar__report-val nav-bar__report-val--danger">{stats.min.toFixed(3)} mm</span>
              </div>
              <div className="nav-bar__report-row">
                <span>Max Ø</span>
                <span className="nav-bar__report-val nav-bar__report-val--warn">{stats.max.toFixed(3)} mm</span>
              </div>
              <div className="nav-bar__report-divider" />
              <div className="nav-bar__report-row">
                <span>⚠ Warning</span>
                <span className="nav-bar__report-val nav-bar__report-val--warn">{stats.warningCount}</span>
              </div>
              <div className="nav-bar__report-row">
                <span>Out of tolerance</span>
                <span className={`nav-bar__report-val ${stats.outOfTolerance > 0 ? "nav-bar__report-val--danger" : "nav-bar__report-val--ok"}`}>
                  {stats.outOfTolerance}
                </span>
              </div>
              <div className="nav-bar__report-footer">
                Tolerance: 2.70 – 3.00 mm · Last {history.length} records
              </div>
              <button
                className="nav-bar__report-export"
                onClick={handleExportReport}
              >
                Download Full Report (XLS)
              </button>
            </div>
          )}
        </div>

        <div className="nav-bar__system-status">
          <span
            className={`nav-bar__status-dot ${
              isHealthy ? "nav-bar__status-dot--online" : ""
            }`}
          />
          <span className={`nav-bar__status-text ${
              isHealthy ? "nav-bar__status-text--online" : ""
            }`}>
            {isHealthy ? "LIVE" : "OFFLINE"}
          </span>
        </div>
      </div>
    </header>
  );
}
