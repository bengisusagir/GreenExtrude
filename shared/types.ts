// ─── Telemetry: Device → Server ───
export interface TelemetryData {
  device_id: string;
  heater_1: number;
  heater_2: number;
  screw_motor_speed: number;
  filament_diameter: number;
  filament_diameter_setting?: number; // the target/preset filament diameter (1.75 or 2.85)
  fans_on?: boolean;              // cooling fans state (true=ON, false=OFF)
  spool_motor_speed: number;
  set_point_1?: number;
  set_point_2?: number;
  timestamp?: string;
}

// ─── Commands: Server → Device ───
export type CommandType =
  | "SET_TEMPERATURE"
  | "SET_SCREW_MOTOR_SPEED"
  | "SET_SPOOL_MOTOR_SPEED"
  | "SET_FILAMENT_DIAMETER"
  | "SET_FANS"
  | "EMERGENCY_STOP"
  | "START"
  | "STOP";

export interface DeviceCommand {
  type: CommandType;
  zone?: number;       // which heating zone (1, 2)
  value?: number;      // target value
  timestamp?: string;
}

// ─── Device Status ───
export type DeviceStatus = "connected" | "disconnected" | "error";

export interface DeviceStatusMessage {
  clientId: string;
  status: DeviceStatus;
  message?: string;
}

// ─── WebSocket Messages: Server → Frontend ───
export type WsMessageType = "telemetry" | "device_status" | "history" | "command_ack";

export interface WsMessage<T = unknown> {
  type: WsMessageType;
  payload: T;
}

// ─── MQTT Topics ───
export const MQTT_TOPICS = {
  TELEMETRY: "greenextrude/telemetry",
  COMMAND: "greenextrude/command",
  STATUS: "greenextrude/status",
} as const;

// ─── Filament Presets ───
export type FilamentDiameterPreset = 2.85 | 1.75;

export interface FilamentPresetValues {
  set_point_1: number;
  set_point_2: number;
  screw_motor_speed: number;
  spool_motor_speed: number;
}

export const FILAMENT_PRESETS: Record<FilamentDiameterPreset, FilamentPresetValues> = {
  2.85: {
    set_point_1: 220,
    set_point_2: 215,
    screw_motor_speed: 45,
    spool_motor_speed: 25,
  },
  1.75: {
    set_point_1: 200,
    set_point_2: 195,
    screw_motor_speed: 35,
    spool_motor_speed: 20,
  },
};

// ─── Sensor Thresholds ───
export const SENSOR_THRESHOLDS = {
  TEMPERATURE: {
    WARNING: 215,
    DANGER: 230,
  },
  FILAMENT_DIAMETER: {
    2.85: {
      TARGET: 2.85,
      WARNING_MIN: 2.78,
      WARNING_MAX: 2.92,
      DANGER_MIN: 2.70,
      DANGER_MAX: 3.00,
    },
    1.75: {
      TARGET: 1.75,
      WARNING_MIN: 1.68,
      WARNING_MAX: 1.82,
      DANGER_MIN: 1.60,
      DANGER_MAX: 1.90,
    },
    // Backwards compatibility / default fallback
    TARGET: 2.85,
    WARNING_MIN: 2.78,
    WARNING_MAX: 2.92,
    DANGER_MIN: 2.70,
    DANGER_MAX: 3.00,
  },
} as const;
