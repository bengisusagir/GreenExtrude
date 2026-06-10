/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — Settings Page Unit Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Covered: CMP-SET-01..05
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Settings from "../../pages/Settings";

const mockSendCommand = vi.fn();

vi.mock("../../context/TelemetryContext", () => ({
  useTelemetry: () => ({
    isConnected: true,
    sendCommand: mockSendCommand,
    telemetry: null,
    history: [],
    deviceStatus: null,
  }),
}));

vi.mock("@mui/material", async () => {
  const actual = await vi.importActual("@mui/material");
  return {
    ...actual,
    Slider: ({ onChange, defaultValue }: { onChange: Function; defaultValue: number }) => (
      <input
        data-testid="motor-speed-slider"
        type="range"
        defaultValue={defaultValue}
        onChange={(e) => onChange(e, Number(e.target.value))}
      />
    ),
  };
});

describe("Settings Page", () => {
  beforeEach(() => {
    mockSendCommand.mockClear();
  });

  it("CMP-SET-01: renders Control Parameters title", () => {
    render(<Settings />);
    expect(screen.getByText("Control Parameters")).toBeInTheDocument();
  });

  it("CMP-SET-02: renders PID input fields", () => {
    render(<Settings />);
    expect(screen.getByLabelText("P-Gain")).toBeInTheDocument();
    expect(screen.getByLabelText("I-Gain")).toBeInTheDocument();
    expect(screen.getByLabelText("D-Gain")).toBeInTheDocument();
  });

  it("CMP-SET-03: renders motor speed slider", () => {
    render(<Settings />);
    expect(screen.getByTestId("motor-speed-slider")).toBeInTheDocument();
  });

  it("CMP-SET-03b: renders temperature set point inputs for all 3 zones", () => {
    render(<Settings />);
    expect(screen.getByLabelText("Zone 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Zone 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Zone 3")).toBeInTheDocument();
  });

  it("CMP-SET-04: Apply & Start sends temperature set points, PID, motor speed, then START", async () => {
    render(<Settings />);
    const applyBtn = screen.getByText("APPLY & START EXTRUSION");
    fireEvent.click(applyBtn);

    expect(mockSendCommand).toHaveBeenCalledTimes(8);
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_TEMPERATURE", zone: 1 })
    );
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_TEMPERATURE", zone: 2 })
    );
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_TEMPERATURE", zone: 3 })
    );
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_MOTOR_SPEED" })
    );
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_PID", zone: 1 })
    );
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_PID", zone: 2 })
    );
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_PID", zone: 3 })
    );
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: "START" })
    );
  });

  it("CMP-SET-05: Emergency Stop sends EMERGENCY_STOP command", () => {
    render(<Settings />);
    const emergencyBtn = screen.getByText("EMERGENCY STOP");
    fireEvent.click(emergencyBtn);

    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: "EMERGENCY_STOP" })
    );
  });
});
