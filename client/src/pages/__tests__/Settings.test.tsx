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

  it("CMP-SET-04: Apply & Start sends SET_MOTOR_SPEED then START commands", async () => {
    render(<Settings />);
    const applyBtn = screen.getByText("APPLY & START EXTRUSION");
    fireEvent.click(applyBtn);

    expect(mockSendCommand).toHaveBeenCalledTimes(2);
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_MOTOR_SPEED" })
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
