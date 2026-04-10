import { useState } from "react";
import "./styles/MotorRPM.sass";

interface MotorRPMProps {
  rpm?: number;
  onSpeedChange?: (speed: number) => void;
}

export default function MotorRPM({ rpm }: MotorRPMProps) {

  return (
    <div className="motor-rpm-slider glass-card">
      <div className="motor-rpm-slider__header">
        <div className="motor-rpm-slider__title-wrapper">
          <div className="motor-rpm-slider__title-bar"></div>
          <h3 className="motor-rpm-slider__title">EXTRUDER MOTOR RPM</h3>
        </div>
        <svg
            className="motor-rpm-slider__icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#3AB0FF"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
      </div>

      <div className="motor-rpm-slider__value">
        <span className="motor-rpm-slider__value-number">{rpm}</span>
        <span className="motor-rpm-slider__value-unit">RPM</span>
      </div>

    </div>
  );
}
