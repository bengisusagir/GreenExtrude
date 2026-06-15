/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — Settings Page Unit Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Covered: CMP-SET-01..06
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
    Slider: ({ onChange, defaultValue, "aria-label": ariaLabel }: { onChange: Function; defaultValue: number; "aria-label"?: string }) => (
      <input
        data-testid={ariaLabel ? `slider-${ariaLabel.toLowerCase().replace(/\s+/g, "-")}` : "slider"}
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

  it("CMP-SET-02: renders filament diameter dropdown with both options", () => {
    render(<Settings />);
    expect(screen.getByText("Filament Diameter")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByText("2.85 mm")).toBeInTheDocument();
    expect(screen.getByText("1.75 mm")).toBeInTheDocument();
  });

  it("CMP-SET-03: renders screw and spool motor speed sliders", () => {
    render(<Settings />);
    expect(screen.getByText("Screw Motor Speed")).toBeInTheDocument();
    expect(screen.getByText("Spool Motor Speed")).toBeInTheDocument();
  });

  it("CMP-SET-03b: renders temperature set point input", () => {
    render(<Settings />);
    expect(screen.getByLabelText("Set Point")).toBeInTheDocument();
  });

  it("CMP-SET-04: Apply & Start sends temperature set point, motor speeds, fans status, filament diameter, then START (6 commands)", async () => {
    render(<Settings />);
    const applyBtn = screen.getByText("APPLY & START EXTRUSION");
    fireEvent.click(applyBtn);

    expect(mockSendCommand).toHaveBeenCalledTimes(6);
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_TEMPERATURE" })
    );
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_SCREW_MOTOR_SPEED" })
    );
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_SPOOL_MOTOR_SPEED" })
    );
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_FANS" })
    );
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_FILAMENT_DIAMETER" })
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
