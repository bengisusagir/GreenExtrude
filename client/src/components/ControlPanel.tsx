import { useTelemetry } from "../context/TelemetryContext";
import "./styles/ControlPanel.sass";

export default function ControlPanel() {
  const { isConnected, sendCommand } = useTelemetry();

  return (
    <div className="control-panel">
      <h2 className="control-panel__title">Machine Control</h2>
      <div className="control-panel__buttons">

        <button
          className="control-panel__btn control-panel__btn--start"
          onClick={() => sendCommand({ type: "START" })}
          disabled={!isConnected}
        >
          ▶ Start
        </button>

        <button
          className="control-panel__btn control-panel__btn--stop"
          onClick={() => sendCommand({ type: "STOP" })}
          disabled={!isConnected}
        >
          ■ Stop
        </button>

        <button
          className="control-panel__btn control-panel__btn--emergency"
          onClick={() => sendCommand({ type: "EMERGENCY_STOP" })}
          disabled={!isConnected}
        >
          ⚠ Emergency Stop
        </button>

      </div>
    </div>
  );
}
