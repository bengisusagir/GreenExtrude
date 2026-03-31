/**
 * App.tsx  —  Root component
 * ──────────────────────────
 * Responsibilities:
 *   1. Wrap the whole app in <TelemetryProvider> so every component can access
 *      live sensor data via the useTelemetry() hook (no prop-drilling).
 *   2. Render the persistent <StatusBar> header and the <Dashboard> page.
 *
 * Component tree:
 *   <TelemetryProvider>   ← opens & manages the WebSocket connection
 *     <StatusBar />        ← fixed header: server + device connection status
 *     <Dashboard />        ← sensor cards, control panel, telemetry log
 *   </TelemetryProvider>
 */

import { TelemetryProvider } from "./context/TelemetryContext";
import StatusBar from "./components/StatusBar";
import Dashboard from "./pages/Dashboard";
import "./App.sass";

export default function App() {
  return (
    <TelemetryProvider>
      <div className="dashboard">
        <StatusBar />
        <Dashboard />
      </div>
    </TelemetryProvider>
  );
}
