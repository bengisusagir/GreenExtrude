import { useTelemetryHealth } from "../context/TelemetryHealthContext";
import "./styles/NavigationBar.sass";

interface NavigationBarProps {
  activePage?: "dashboard" | "settings";
  onNavigate?: (page: "dashboard" | "settings") => void;
}

export default function NavigationBar({
  activePage = "dashboard",
  onNavigate,
}: NavigationBarProps) {
  const { isHealthy } = useTelemetryHealth();

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    page: "dashboard" | "settings"
  ) => {
    e.preventDefault();
    onNavigate?.(page);
  };

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
