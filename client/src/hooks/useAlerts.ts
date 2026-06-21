import { useState, useEffect, useRef } from "react";
import { useTelemetry } from "../context/TelemetryContext";
import { SENSOR_THRESHOLDS } from "../shared/types";

export interface AlertItem {
  id: string;
  type: "warning" | "danger" | "info";
  message: string;
  timestamp: number;
}

const MAX_ALERTS = 50;
const COOLDOWN_MS = 15_000; 

/**
 * Watches incoming telemetry and generates alerts when sensor values
 * exceed defined thresholds or look suspiciously fake / out-of-range.
 */
export function useAlerts(): AlertItem[] {
  const { telemetry } = useTelemetry();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const lastAlertKey = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!telemetry) return;

    const newAlerts: AlertItem[] = [];
    const now = Date.now();

    const check = (key: string, level: "warning" | "danger", message: string) => {
      const last = lastAlertKey.current[key] ?? 0;
      if (now - last < COOLDOWN_MS) return;
      lastAlertKey.current[key] = now;
      newAlerts.push({
        id: `${key}-${now}-${Math.random().toString(36).slice(2, 7)}`,
        type: level,
        message,
        timestamp: now,
      });
    };

    const { WARNING: TEMP_WARN, DANGER: TEMP_DANGER } = SENSOR_THRESHOLDS.TEMPERATURE;

    for (const zone of [1, 2]) {
      const temp = telemetry[`heater_${zone}` as keyof typeof telemetry] as number;
      if (!temp || typeof temp !== "number") continue;

      if (temp >= TEMP_DANGER) {
        check(`temp${zone}-danger-high`, "danger", `Zone ${zone} temperature critical: ${temp.toFixed(1)}°C (≥ ${TEMP_DANGER}°C)`);
      } else if (temp >= TEMP_WARN) {
        check(`temp${zone}-warn-high`, "warning", `Zone ${zone} temperature high: ${temp.toFixed(1)}°C (≥ ${TEMP_WARN}°C)`);
      }

      if (temp < 60) {
        check(`temp${zone}-low`, "danger", `Zone ${zone} temperature abnormally low: ${temp.toFixed(1)}°C — possible sensor failure`);
      }
    }

    const activePreset = (telemetry.filament_diameter_setting === 1.75 || telemetry.filament_diameter_setting === 2.85)
      ? telemetry.filament_diameter_setting
      : 2.85;
    const { TARGET, WARNING_MIN, WARNING_MAX, DANGER_MIN, DANGER_MAX } = SENSOR_THRESHOLDS.FILAMENT_DIAMETER[activePreset];
    const dia = telemetry.filament_diameter;

    if (dia !== undefined && typeof dia === "number") {
      if (dia <= DANGER_MIN || dia >= DANGER_MAX) {
        check("dia-danger", "danger", `Filament diameter out of spec: ${dia.toFixed(2)}mm (danger range)`);
      } else if (dia <= WARNING_MIN || dia >= WARNING_MAX) {
        check("dia-warn", "warning", `Filament diameter drifting: ${dia.toFixed(2)}mm (target ${TARGET}mm)`);
      }
    }

    const screwMotor = telemetry.screw_motor_speed;
    if (screwMotor !== undefined && typeof screwMotor === "number") {
      if (screwMotor === 0) {
        check("screw-motor-stalled", "danger", `Screw motor speed at 0 RPM — possible stall detected`);
      } else if (screwMotor > 60) {
        check("screw-motor-high", "warning", `Screw motor speed abnormally high: ${screwMotor.toFixed(0)} RPM`);
      }
    }

    const spoolMotor = telemetry.spool_motor_speed;
    if (spoolMotor !== undefined && typeof spoolMotor === "number") {
      if (spoolMotor === 0) {
        check("spool-motor-stopped", "warning", `Spool motor speed at 0 RPM — production halted`);
      } else if (spoolMotor > 55) {
        check("spool-motor-high", "warning", `Spool motor speed abnormally high: ${spoolMotor.toFixed(0)} RPM`);
      }
    }

    if (newAlerts.length > 0) {
      setAlerts((prev) => [...newAlerts, ...prev].slice(0, MAX_ALERTS));
    }
  }, [telemetry]);

  return alerts;
}