/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GreenExtrude — MotorRPM Component Unit Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Covered: CMP-MOT-01..03
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MotorRPM from "../../components/MotorRPM";

describe("MotorRPM Component", () => {
  it("CMP-MOT-01: renders RPM value when provided", () => {
    render(<MotorRPM rpm={30} />);
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("CMP-MOT-02: renders RPM unit label", () => {
    render(<MotorRPM rpm={30} />);
    expect(screen.getByText("RPM")).toBeInTheDocument();
  });

  it("CMP-MOT-03: renders title header", () => {
    render(<MotorRPM rpm={30} />);
    expect(screen.getByText("EXTRUDER MOTOR RPM")).toBeInTheDocument();
  });
});
