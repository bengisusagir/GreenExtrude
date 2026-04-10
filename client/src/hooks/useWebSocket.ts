
import { useState, useEffect, useRef, useCallback } from "react";
import type { TelemetryData, WsMessage, DeviceCommand, DeviceStatusMessage } from "../shared/types";
import { recordTelemetryUpdate } from "../context/TelemetryHealthContext";

const WS_URL = "ws://localhost:3002";
const HISTORY_MAX_LENGTH = 100;

interface UseWebSocketReturn {
  telemetry: TelemetryData | null;
  history: TelemetryData[];
  deviceStatus: DeviceStatusMessage | null;
  isConnected: boolean;
  sendCommand: (command: DeviceCommand) => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [history, setHistory] = useState<TelemetryData[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatusMessage | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS] Connected to server");
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);

        switch (msg.type) {
          case "telemetry": {
            const data = msg.payload as TelemetryData;
            setTelemetry(data);
            setHistory((prev) => [...prev.slice(-(HISTORY_MAX_LENGTH - 1)), data]);
            recordTelemetryUpdate();
            break;
          }
          case "history": {
            const historyData = msg.payload as TelemetryData[];
            setHistory(historyData);
            if (historyData.length > 0) {
              setTelemetry(historyData[historyData.length - 1]);
            }
            break;
          }
          case "device_status": {
            setDeviceStatus(msg.payload as DeviceStatusMessage);
            break;
          }
        }
      } catch (err) {
        console.error("[WS] Parse error:", err);
      }
    };

    ws.onclose = () => {
      console.log("[WS] Disconnected, reconnecting in 3s...");
      setIsConnected(false);
      reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
    };

    ws.onerror = (err) => {
      console.error("[WS] Error:", err);
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  const sendCommand = useCallback((command: DeviceCommand) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "command", payload: command }));
    }
  }, []);

  return { telemetry, history, deviceStatus, isConnected, sendCommand };
}
