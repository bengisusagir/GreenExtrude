import React, { createContext, useContext } from "react";
import { useWebSocket } from "../hooks/useWebSocket";
import type { TelemetryData, DeviceStatusMessage, DeviceCommand } from "../shared/types";

// ─── Context Shape ────────────────────────────────────────────────────────────

interface TelemetryContextValue {
  /** Most recent telemetry snapshot received from the device */
  telemetry: TelemetryData | null;

  /** Ring-buffer of the last HISTORY_MAX_LENGTH telemetry readings */
  history: TelemetryData[];

  /** Last device-connection event (connected / disconnected / error) */
  deviceStatus: DeviceStatusMessage | null;

  /** True while the WebSocket to the Node server is open */
  isConnected: boolean;

  /**
   * Send a command to the physical device (or simulator).
   * The server relays it over MQTT.
   *
   * @example
   * sendCommand({ type: "START" });
   * sendCommand({ type: "SET_TEMPERATURE", zone: 2, value: 210 });
   */
  sendCommand: (command: DeviceCommand) => void;
}

// ─── Context Object ───────────────────────────────────────────────────────────

// `null` as default so useTelemetry() can detect if called outside the provider.
const TelemetryContext = createContext<TelemetryContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

/**
 * Wraps the application and provides live telemetry data to all descendants.
 * Place this as high in the tree as possible (App.tsx is ideal).
 */
export function TelemetryProvider({ children }: { children: React.ReactNode }) {
  // useWebSocket manages the connection, reconnection, and message parsing.
  // We simply forward its return value into the context.
  const wsState = useWebSocket();

  return (
    <TelemetryContext.Provider value={wsState}>
      {children}
    </TelemetryContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Access live telemetry state from any component inside <TelemetryProvider>.
 * Throws a clear error if called outside the provider (helps during development).
 */
export function useTelemetry(): TelemetryContextValue {
  const ctx = useContext(TelemetryContext);
  if (!ctx) {
    throw new Error("useTelemetry() must be called inside <TelemetryProvider>.");
  }
  return ctx;
}
