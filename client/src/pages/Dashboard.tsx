import { useTelemetry } from "../context/TelemetryContext";
import { useAlerts } from "../hooks/useAlerts";
import TemperatureGauge from "../components/TemperatureGauge";
import DiameterChart from "../components/DiameterChart";
import MotorRPMSlider from "../components/MotorRPM";
import SystemStatus from "../components/SystemStatus";
import Alerts from "../components/Alerts";
import "./styles/Dashboard.sass";

export default function Dashboard() {
  const { telemetry, isConnected, history } = useTelemetry();
  const alerts = useAlerts();
  const chartData = history
    .slice(-20)
    .reverse()
    .map((item) => ({
      time: item.timestamp
        ? new Date(
            item.timestamp.endsWith("Z") || item.timestamp.includes("+")
              ? item.timestamp
              : item.timestamp.replace(" ", "T") + "Z"
          ).toLocaleTimeString("en-US", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : "--:--:--",
      diameter: item.filament_diameter ?? 0,
    }));

  return (
    <main className="dashboard__new-layout">
      {!isConnected && (
        <div className="dashboard__offline-banner">System Offline</div>
      )}

      <div className="dashboard__content-new">
        <div className="dashboard__left-column">
          <div className="dashboard__gauges-row">
            <TemperatureGauge
              title="HEATER 1"
              temperature={telemetry?.heater_1 ?? 0}
              setPoint={telemetry?.set_point_1 ?? 220}
            />
            <TemperatureGauge
              title="HEATER 2"
              temperature={telemetry?.heater_2 ?? 0}
              setPoint={telemetry?.set_point_2 ?? 215}
            />
          </div>

          <div className="dashboard__chart-row">
            <DiameterChart
              data={chartData}
              currentValue={telemetry?.filament_diameter}
              target={telemetry?.filament_diameter_setting ?? 2.85}
            />
          </div>
        </div>

        <div className="dashboard__right-column">
          <div className="dashboard__motor-rpm-row">
            <MotorRPMSlider rpm={telemetry?.screw_motor_speed ?? 0} title="SCREW MOTOR RPM" />
          </div>
          <div className="dashboard__motor-rpm-row">
            <MotorRPMSlider rpm={telemetry?.spool_motor_speed ?? 0} title="SPOOL MOTOR RPM" />
          </div>

          <div className="dashboard__system-status-row">
            <SystemStatus />
          </div>

          <div className="dashboard__alerts-row">
            <Alerts alerts={alerts} />
          </div>
        </div>
      </div>
    </main>
  );
}
