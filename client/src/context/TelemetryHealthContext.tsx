import React, { createContext, useContext, useState, useEffect } from "react";

interface TelemetryHealthContextValue {
  isHealthy: boolean;
  timeoutMs: number;
}

const TelemetryHealthContext = createContext<TelemetryHealthContextValue | null>(null);

const DEFAULT_TIMEOUT_MS = 2000;

const updateCallbacks: Set<() => void> = new Set();

export function recordTelemetryUpdate() {
  updateCallbacks.forEach(callback => callback());
}

interface TelemetryHealthProviderProps {
  children: React.ReactNode;
  timeoutMs?: number;
}

export function TelemetryHealthProvider({
  children,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: TelemetryHealthProviderProps) {
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [counter, setCounter] = useState(0);

  // Register this instance's callback
  useEffect(() => {
    const callback = () => {
      setLastUpdate(Date.now());
    };
    updateCallbacks.add(callback);
    return () => {
      updateCallbacks.delete(callback);
    };
  }, []);

  // Timer to periodically check health and force re-renders
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastUpdate) {
        const age = Date.now() - lastUpdate;
        if (age > timeoutMs) {
          setCounter(prev => prev + 1);
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [lastUpdate, timeoutMs]);

  const isHealthy = React.useMemo(() => {
    if (!lastUpdate) return false;
    const age = Date.now() - lastUpdate;
    return age < timeoutMs;
  }, [lastUpdate, timeoutMs, counter]);

  const value: TelemetryHealthContextValue = {
    isHealthy,
    timeoutMs,
  };

  return (
    <TelemetryHealthContext.Provider value={value}>
      {children}
    </TelemetryHealthContext.Provider>
  );
}

export function useTelemetryHealth(): TelemetryHealthContextValue {
  const ctx = useContext(TelemetryHealthContext);
  if (!ctx) {
    throw new Error(
      "useTelemetryHealth() must be called inside <TelemetryHealthProvider>."
    );
  }
  return ctx;
}
