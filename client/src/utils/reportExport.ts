/**
 * Quality stats computation + HTML table generator for the .xls report.
 */

import type { TelemetryData } from "../shared/types";

export interface QualityStats {
  n: number;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  outOfTolerance: number;
  warningCount: number;
}

export function computeQualityStats(history: TelemetryData[]): QualityStats | null {
  const diameters = history
    .map((h) => h.filament_diameter)
    .filter((d): d is number => d !== undefined && d !== null && d > 0);

  if (diameters.length === 0) return null;

  const n = diameters.length;
  const sum = diameters.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const variance = diameters.reduce((acc, d) => acc + (d - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  const min = Math.min(...diameters);
  const max = Math.max(...diameters);
  const outOfTolerance = diameters.filter(
    (d) => d < 2.70 || d > 3.00
  ).length;
  const warningCount = diameters.filter(
    (d) => (d >= 2.70 && d < 2.78) || (d > 2.92 && d <= 3.00)
  ).length;

  return { n, mean, stdDev, min, max, outOfTolerance, warningCount };
}

function fmtTimestamp(ts?: string): string {
  return ts
    ? new Date(ts).toLocaleString("tr-TR", { hour12: false }).replace(" ", " ")
    : "—";
}

export function toHtmlTable(
  history: TelemetryData[],
  stats: QualityStats
): string {
  const rows = history
    .map(
      (r, i) =>
        `<tr${i % 2 === 0 ? ' style="background:#f8f9fa"' : ""}>
          <td style="padding:4px 8px;border:1px solid #dee2e6">${fmtTimestamp(r.timestamp)}</td>
          <td style="padding:4px 8px;border:1px solid #dee2e6;text-align:center">${r.heater_1}</td>
          <td style="padding:4px 8px;border:1px solid #dee2e6;text-align:center">${r.heater_2}</td>
          <td style="padding:4px 8px;border:1px solid #dee2e6;text-align:center">${r.screw_motor_speed}</td>
          <td style="padding:4px 8px;border:1px solid #dee2e6;text-align:center">${r.filament_diameter}</td>
          <td style="padding:4px 8px;border:1px solid #dee2e6;text-align:center">${r.spool_motor_speed}</td>
        </tr>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>GreenExtrude Quality Report</title></head><body>
<h2 style="color:#2ECC71;font-family:Arial;margin-bottom:4px">GreenExtrude — Quality Report</h2>
<p style="color:#666;font-family:Arial;font-size:13px;margin-top:0">Generated: ${new Date().toLocaleString("tr-TR", { hour12: false })}</p>

<table style="border-collapse:collapse;font-family:Arial;font-size:13px;margin-bottom:20px">
  <tr><td style="padding:4px 12px;font-weight:700">Total Readings</td><td style="padding:4px 12px">${stats.n}</td></tr>
  <tr style="background:#f8f9fa"><td style="padding:4px 12px;font-weight:700">Mean Diameter</td><td style="padding:4px 12px">${stats.mean.toFixed(4)} mm</td></tr>
  <tr><td style="padding:4px 12px;font-weight:700">Std Deviation</td><td style="padding:4px 12px">±${stats.stdDev.toFixed(4)} mm</td></tr>
  <tr style="background:#f8f9fa"><td style="padding:4px 12px;font-weight:700">Min Diameter</td><td style="padding:4px 12px;color:#dc3545">${stats.min.toFixed(3)} mm</td></tr>
  <tr><td style="padding:4px 12px;font-weight:700">Max Diameter</td><td style="padding:4px 12px;color:#ff9800">${stats.max.toFixed(3)} mm</td></tr>
  <tr style="background:#f8f9fa"><td style="padding:4px 12px;font-weight:700">Warning Count</td><td style="padding:4px 12px;color:#ff9800">${stats.warningCount}</td></tr>
  <tr><td style="padding:4px 12px;font-weight:700">Out of Tolerance (≤2.70 / ≥3.00 mm)</td><td style="padding:4px 12px;${stats.outOfTolerance > 0 ? "color:#dc3545;font-weight:700" : "color:#28a745"}">${stats.outOfTolerance}</td></tr>
</table>

<h3 style="color:#333;font-family:Arial">Raw Telemetry Data (${history.length} records)</h3>
<table style="border-collapse:collapse;font-family:Arial;font-size:11px">
<thead>
  <tr style="background:#2ECC71;color:white">
    <th style="padding:6px 8px;border:1px solid #27ae60;text-align:left">Timestamp</th>
    <th style="padding:6px 8px;border:1px solid #27ae60;text-align:center">Heater 1</th>
    <th style="padding:6px 8px;border:1px solid #27ae60;text-align:center">Heater 2</th>
    <th style="padding:6px 8px;border:1px solid #27ae60;text-align:center">Screw Motor RPM</th>
    <th style="padding:6px 8px;border:1px solid #27ae60;text-align:center">Filament Ø (mm)</th>
    <th style="padding:6px 8px;border:1px solid #27ae60;text-align:center">Spool Motor RPM</th>
  </tr>
</thead>
<tbody>
${rows}
</tbody>
</table>
</body></html>`;
}

export function downloadHtmlAsXls(html: string, filename: string): void {
  const bom = "\uFEFF";
  const blob = new Blob([bom + html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
