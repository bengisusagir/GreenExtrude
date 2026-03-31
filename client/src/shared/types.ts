// ─── Telemetry: Device → Server ───
export interface TelemetryData {
  device_id: string;
  temperature_zone1: number;
  temperature_zone2: number;
  temperature_zone3: number;
  motor_speed: number;
  filament_diameter: number;
  winder_speed: number;
  timestamp?: string;
}

// ─── Commands: Server → Device ───
export type CommandType =
  | "SET_TEMPERATURE"
  | "SET_MOTOR_SPEED"
  | "SET_WINDER_SPEED"
  | "EMERGENCY_STOP"
  | "START"
  | "STOP";

export interface DeviceCommand {
  type: CommandType;
  zone?: number;
  value?: number;
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
