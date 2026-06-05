import { useState } from "react";
import { useTelemetry } from "../context/TelemetryContext";
import "./styles/Settings.sass";
import { Slider } from "@mui/material";

export default function Settings() {
  const [pGain, setPGain] = useState(1.20);
  const [iGain, setIGain] = useState(0.05);
  const [dGain, setDGain] = useState(0.10);
  const [motorSpeed, setMotorSpeed] = useState(45);

  const [tempZone1, setTempZone1] = useState(220);
  const [tempZone2, setTempZone2] = useState(215);
  const [tempZone3, setTempZone3] = useState(210);

  const { isConnected, sendCommand } = useTelemetry();

  const handleApplyAndStart = () => {
    sendCommand({
      type: "SET_TEMPERATURE",
      zone: 1,
      value: tempZone1,
      timestamp: new Date().toISOString(),
    });
    sendCommand({
      type: "SET_TEMPERATURE",
      zone: 2,
      value: tempZone2,
      timestamp: new Date().toISOString(),
    });
    sendCommand({
      type: "SET_TEMPERATURE",
      zone: 3,
      value: tempZone3,
      timestamp: new Date().toISOString(),
    });
    sendCommand({
      type: "SET_MOTOR_SPEED",
      value: motorSpeed,
      timestamp: new Date().toISOString(),
    });

    sendCommand({
      type: "START",
      timestamp: new Date().toISOString(),
    });

    console.log("Applying parameters and starting extrusion:", {
      pGain,
      iGain,
      dGain,
      motorSpeed,
      tempZone1,
      tempZone2,
      tempZone3,
    });
  };

  const handleEmergencyStop = () => {
    sendCommand({
      type: "EMERGENCY_STOP",
      timestamp: new Date().toISOString(),
    });
    console.log("Emergency stop triggered!");
  };

  return (
    <main className="settings">
      <div className="settings__control-panel">
        <h1 className="settings__title">Control Parameters</h1>

        <div className="settings__pid-section">
          <div className="settings__pid-row">
            <label className="settings__pid-label" htmlFor="p-gain">
              P-Gain
            </label>
            <input
              id="p-gain"
              type="number"
              className="settings__pid-input"
              value={pGain}
              onChange={(e) => setPGain(parseFloat(e.target.value) || 0)}
              step="0.01"
              min="0"
              max="10"
            />
          </div>

          <div className="settings__pid-row">
            <label className="settings__pid-label" htmlFor="i-gain">
              I-Gain
            </label>
            <input
              id="i-gain"
              type="number"
              className="settings__pid-input"
              value={iGain}
              onChange={(e) => setIGain(parseFloat(e.target.value) || 0)}
              step="0.01"
              min="0"
              max="10"
            />
          </div>

          <div className="settings__pid-row">
            <label className="settings__pid-label" htmlFor="d-gain">
              D-Gain
            </label>
            <input
              id="d-gain"
              type="number"
              className="settings__pid-input"
              value={dGain}
              onChange={(e) => setDGain(parseFloat(e.target.value) || 0)}
              step="0.01"
              min="0"
              max="10"
            />
          </div>
        </div>

        {/* ─── Temperature Set Points ─── */}
        <div className="settings__temp-section">
          <h2 className="settings__section-title">Heater Set Points (°C)</h2>
          <div className="settings__temp-grid">
            <div className="settings__temp-item">
              <label className="settings__temp-label" htmlFor="temp-zone1">Zone 1</label>
              <input
                id="temp-zone1"
                type="number"
                className="settings__temp-input settings__temp-input--zone1"
                value={tempZone1}
                onChange={(e) => setTempZone1(parseFloat(e.target.value) || 0)}
                step="5"
                min="0"
                max="300"
              />
            </div>
            <div className="settings__temp-item">
              <label className="settings__temp-label" htmlFor="temp-zone2">Zone 2</label>
              <input
                id="temp-zone2"
                type="number"
                className="settings__temp-input settings__temp-input--zone2"
                value={tempZone2}
                onChange={(e) => setTempZone2(parseFloat(e.target.value) || 0)}
                step="5"
                min="0"
                max="300"
              />
            </div>
            <div className="settings__temp-item">
              <label className="settings__temp-label" htmlFor="temp-zone3">Zone 3</label>
              <input
                id="temp-zone3"
                type="number"
                className="settings__temp-input settings__temp-input--zone3"
                value={tempZone3}
                onChange={(e) => setTempZone3(parseFloat(e.target.value) || 0)}
                step="5"
                min="0"
                max="300"
              />
            </div>
          </div>
        </div>

        <div className="settings__motor-section">
          <div className="settings__motor-header">
            <span className="settings__motor-label">Extruder Motor Speed</span>
            <span className="settings__motor-value">{motorSpeed} RPM</span>
          </div>
          <Slider
            aria-label=""
            defaultValue={motorSpeed}
            valueLabelFormat={(value) => `${value} RPM`}
            onChange={(e, value) => setMotorSpeed(value as number)}
            step={1}
            valueLabelDisplay="auto"
          />
        </div>

        <div className="settings__buttons">
          <button
            className="settings__btn settings__btn--apply"
            onClick={handleApplyAndStart}
          >
            APPLY & START EXTRUSION
          </button>
          <button
            className="settings__btn settings__btn--emergency"
            onClick={handleEmergencyStop}
          >
            EMERGENCY STOP
          </button>
        </div>
      </div>
    </main>
  );
}
