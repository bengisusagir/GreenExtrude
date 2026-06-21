import { useState, useEffect } from "react";
import { useTelemetry } from "../context/TelemetryContext";
import { FILAMENT_PRESETS, type FilamentDiameterPreset } from "../shared/types";
import "./styles/Settings.sass";
import { Slider, Snackbar, Alert } from "@mui/material";

export default function Settings() {
  const { isConnected, sendCommand, telemetry } = useTelemetry();

  const [filamentDiameter, setFilamentDiameter] = useState<FilamentDiameterPreset>(2.85);

  const [tempSetPoint, setTempSetPoint] = useState(FILAMENT_PRESETS[2.85].set_point);
  const [screwMotorSpeed, setScrewMotorSpeed] = useState(FILAMENT_PRESETS[2.85].screw_motor_speed);
  const [spoolMotorSpeed, setSpoolMotorSpeed] = useState(FILAMENT_PRESETS[2.85].spool_motor_speed);
  const [fansOn, setFansOn] = useState(true);

  const [hasInitialized, setHasInitialized] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastSeverity, setToastSeverity] = useState<"success" | "error">("success");

  // Check if current form values mismatch the selected preset values
  const currentPresetValues = FILAMENT_PRESETS[filamentDiameter];
  const isPresetMismatch =
    tempSetPoint !== currentPresetValues.set_point ||
    screwMotorSpeed !== currentPresetValues.screw_motor_speed ||
    spoolMotorSpeed !== currentPresetValues.spool_motor_speed;

  // Initialize from telemetry on first connection
  useEffect(() => {
    if (telemetry && !hasInitialized) {
      if (telemetry.set_point !== undefined) setTempSetPoint(telemetry.set_point);
      if (telemetry.screw_motor_speed !== undefined) setScrewMotorSpeed(Math.round(telemetry.screw_motor_speed));
      if (telemetry.spool_motor_speed !== undefined) setSpoolMotorSpeed(Math.round(telemetry.spool_motor_speed));
      if (telemetry.fans_on !== undefined) setFansOn(telemetry.fans_on);
      if (telemetry.filament_diameter_setting === 1.75 || telemetry.filament_diameter_setting === 2.85) {
        setFilamentDiameter(telemetry.filament_diameter_setting);
      }
      setHasInitialized(true);
    }
  }, [telemetry, hasInitialized]);

  // When filament diameter preset changes, replace all settable values and send command
  const handleFilamentChange = (preset: FilamentDiameterPreset) => {
    setFilamentDiameter(preset);
    const values = FILAMENT_PRESETS[preset];
    setTempSetPoint(values.set_point);
    setScrewMotorSpeed(values.screw_motor_speed);
    setSpoolMotorSpeed(values.spool_motor_speed);

    // Send the filament diameter setting to the ESP32 so it persists & appears in telemetry
    sendCommand({
      type: "SET_FILAMENT_DIAMETER",
      value: preset,
      timestamp: new Date().toISOString(),
    });
  };

  const handleApplyAndStart = () => {
    sendCommand({
      type: "SET_TEMPERATURE",
      value: tempSetPoint,
      timestamp: new Date().toISOString(),
    });
    sendCommand({
      type: "SET_SCREW_MOTOR_SPEED",
      value: screwMotorSpeed,
      timestamp: new Date().toISOString(),
    });
    sendCommand({
      type: "SET_SPOOL_MOTOR_SPEED",
      value: spoolMotorSpeed,
      timestamp: new Date().toISOString(),
    });
    sendCommand({
      type: "SET_FANS",
      value: fansOn ? 1 : 0,
      timestamp: new Date().toISOString(),
    });
    sendCommand({
      type: "SET_FILAMENT_DIAMETER",
      value: filamentDiameter,
      timestamp: new Date().toISOString(),
    });

    sendCommand({
      type: "START",
      timestamp: new Date().toISOString(),
    });

    setToastMessage("Extrusion parameters applied and process started.");
    setToastSeverity("success");
    setToastOpen(true);

    console.log("Applying parameters and starting extrusion:", {
      filamentDiameter,
      tempSetPoint,
      screwMotorSpeed,
      spoolMotorSpeed,
      fansOn,
    });
  };

  const handleEmergencyStop = () => {
    sendCommand({
      type: "EMERGENCY_STOP",
      timestamp: new Date().toISOString(),
    });
    setToastMessage("Emergency stop triggered. Process halted.");
    setToastSeverity("error");
    setToastOpen(true);
    console.log("Emergency stop triggered!");
  };

  return (
    <main className="settings">
      <div className="settings__control-panel">
        <h1 className="settings__title">Control Parameters</h1>

        {/* ─── Filament Diameter Preset ─── */}
        <div className="settings__filament-section">
          <label className="settings__section-title">Filament Diameter</label>
          <div className="settings__filament-dropdown">
            <select
              className="settings__select"
              value={filamentDiameter}
              onChange={(e) => {
                handleFilamentChange(Number(e.target.value) as FilamentDiameterPreset);
              }}
            >
              <option value={2.85}>2.85 mm</option>
              <option value={1.75}>1.75 mm</option>
            </select>
          </div>
          {isPresetMismatch && (
            <div className="settings__mismatch-banner">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="settings__mismatch-icon">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              <span>Values modified from standard {filamentDiameter}mm preset.</span>
              <button
                type="button"
                className="settings__reset-btn"
                onClick={() => handleFilamentChange(filamentDiameter)}
              >
                Reset to Preset
              </button>
            </div>
          )}
        </div>

        {/* ─── Temperature Set Point ─── */}
        <div className="settings__temp-section">
          <h2 className="settings__section-title">Heater Target Temperature (°C)</h2>
          <div className="settings__temp-grid settings__temp-grid--two">
            <div className="settings__temp-item">
              <label className="settings__temp-label" htmlFor="temp-setpoint">Set Point</label>
              <div className="settings__temp-control settings__temp-control--zone1">
                <button
                  type="button"
                  className="settings__temp-btn settings__temp-btn--down"
                  onClick={() => {
                    setTempSetPoint((prev) => Math.max(0, prev - 5));
                  }}
                  aria-label="Decrease Temperature"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
                <input
                  id="temp-setpoint"
                  type="number"
                  className="settings__temp-input"
                  value={tempSetPoint}
                  onChange={(e) => {
                    setTempSetPoint(parseFloat(e.target.value) || 0);
                  }}
                  step="5"
                  min="0"
                  max="300"
                />
                <button
                  type="button"
                  className="settings__temp-btn settings__temp-btn--up"
                  onClick={() => {
                    setTempSetPoint((prev) => Math.min(300, prev + 5));
                  }}
                  aria-label="Increase Temperature"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15"></polyline>
                  </svg>
                </button>
              </div>
            </div>

            {/* ─── Cooling Fans Toggle ─── */}
            <div className="settings__temp-item">
              <label className="settings__temp-label">Cooling Fans</label>
              <div className="settings__fans-control">
                <label className="settings__fans-toggle" htmlFor="fans-toggle">
                  <input
                    id="fans-toggle"
                    type="checkbox"
                    className="settings__fans-checkbox"
                    checked={fansOn}
                    onChange={(e) => setFansOn(e.target.checked)}
                  />
                  <span className="settings__fans-slider"></span>
                </label>
                <span className={`settings__fans-status ${fansOn ? "settings__fans-status--on" : "settings__fans-status--off"}`}>
                  {fansOn ? "ON" : "OFF"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Screw Motor Speed ─── */}
        <div className="settings__motor-section">
          <div className="settings__motor-header">
            <span className="settings__motor-label">Screw Motor Speed</span>
            <span className="settings__motor-value">{screwMotorSpeed} RPM</span>
          </div>
          <Slider
            aria-label="Screw motor speed"
            value={screwMotorSpeed}
            valueLabelFormat={(value) => `${value} RPM`}
            onChange={(e, value) => {
              setScrewMotorSpeed(value as number);
            }}
            step={1}
            min={0}
            max={100}
            valueLabelDisplay="auto"
          />
        </div>

        {/* ─── Spool Motor Speed ─── */}
        <div className="settings__motor-section">
          <div className="settings__motor-header">
            <span className="settings__motor-label">Spool Motor Speed</span>
            <span className="settings__motor-value">{spoolMotorSpeed} RPM</span>
          </div>
          <Slider
            aria-label="Spool motor speed"
            value={spoolMotorSpeed}
            valueLabelFormat={(value) => `${value} RPM`}
            onChange={(e, value) => {
              setSpoolMotorSpeed(value as number);
            }}
            step={1}
            min={0}
            max={100}
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

      <Snackbar
        open={toastOpen}
        autoHideDuration={4000}
        onClose={() => setToastOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={() => setToastOpen(false)}
          severity={toastSeverity}
          variant="filled"
          sx={{
            width: "100%",
            bgcolor: toastSeverity === "success" ? "#2ECC71" : "#EF4444",
            color: "#FFFFFF"
          }}
        >
          {toastMessage}
        </Alert>
      </Snackbar>
    </main>
  );
}
