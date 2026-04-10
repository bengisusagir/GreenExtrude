import { useState } from "react";
import { TelemetryProvider } from "./context/TelemetryContext";
import { TelemetryHealthProvider } from "./context/TelemetryHealthContext";
import NavigationBar from "./components/NavigationBar";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import "./App.sass";

type Page = "dashboard" | "settings";

export default function App() {
  const [activePage, setActivePage] = useState<Page>("dashboard");

  return (
    <TelemetryHealthProvider>
      <TelemetryProvider>
        <div className="app">
          <NavigationBar
            activePage={activePage}
            onNavigate={setActivePage}
          />
          <div className="app__content">
            {activePage === "dashboard" && <Dashboard />}
            {activePage === "settings" && <Settings />}
          </div>
        </div>
      </TelemetryProvider>
    </TelemetryHealthProvider>
  );
}
