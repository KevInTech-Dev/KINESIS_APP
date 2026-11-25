"use client";

import { useId, useState } from "react";

export type AnalyticsLineChartPoint = {
  label: string;
  value: number;
  valueLabel: string;
  detail: string;
};

export type AnalyticsLineChartMetric = {
  label: string;
  value: string;
  detail?: string;
};

type AnalyticsLineChartProps = {
  points: AnalyticsLineChartPoint[];
  metrics: AnalyticsLineChartMetric[];
  ariaLabel: string;
  formatAxisValue: (value: number) => string;
  variant?: "emerald" | "gold";
};

function getNiceAxisMaximum(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function buildSmoothPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return "";
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const controlOffset = (point.x - previous.x) / 3;
    return `${path} C ${previous.x + controlOffset} ${previous.y}, ${point.x - controlOffset} ${point.y}, ${point.x} ${point.y}`;
  }, "");
}

export default function AnalyticsLineChart({
  points,
  metrics,
  ariaLabel,
  formatAxisValue,
  variant = "emerald",
}: AnalyticsLineChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const gradientId = `analytics-line-${useId().replace(/:/g, "")}`;
  const axisMaximum = getNiceAxisMaximum(
    Math.max(0, ...points.map((point) => point.value)),
  );
  const chartPoints = points.map((point, index) => ({
    ...point,
    x: 76 + (index * 714) / Math.max(points.length - 1, 1),
    y: 206 - (point.value / axisMaximum) * 166,
  }));
  const linePath = buildSmoothPath(chartPoints);
  const areaPath = chartPoints.length
    ? `${linePath} L ${chartPoints[chartPoints.length - 1].x} 206 L ${chartPoints[0].x} 206 Z`
    : "";
  const activePoint =
    activeIndex === null ? null : chartPoints[activeIndex] ?? null;
  const tooltipX = activePoint
    ? Math.min(Math.max(12, activePoint.x - 78), 820 - 168 - 12)
    : 0;
  const tooltipY = activePoint
    ? Math.min(
        Math.max(12, activePoint.y < 90 ? activePoint.y + 16 : activePoint.y - 76),
        260 - 70,
      )
    : 0;
  const labelInterval = Math.max(1, Math.ceil(chartPoints.length / 7));

  return (
    <div className={`analytics-line-chart-shell analytics-line-chart-shell--${variant}`}>
      <div className="analytics-line-chart__metrics">
        {metrics.map((metric, index) => (
          <div
            className={`analytics-line-chart__metric${index === 0 ? " is-primary" : ""}`}
            key={metric.label}
          >
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            {metric.detail ? <small>{metric.detail}</small> : null}
          </div>
        ))}
      </div>
      <div className="analytics-line-chart__viewport">
        <svg
          className="analytics-line-chart"
          viewBox="0 0 820 260"
          role="group"
          aria-label={ariaLabel}
          onMouseLeave={() => setActiveIndex(null)}
        >
          <defs>
            <linearGradient id={`${gradientId}-area`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--analytics-chart-accent)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--analytics-chart-accent)" stopOpacity="0.01" />
            </linearGradient>
            <filter id={`${gradientId}-shadow`} x="-30%" y="-30%" width="160%" height="180%">
              <feDropShadow
                dx="0"
                dy="3"
                stdDeviation="3"
                floodColor="var(--analytics-chart-accent)"
                floodOpacity="0.2"
              />
            </filter>
          </defs>
          {[38, 94, 150, 206].map((y, index) => (
            <g key={y}>
              <line className="analytics-line-chart__grid" x1="76" x2="790" y1={y} y2={y} />
              <text className="analytics-line-chart__axis-label" x="64" y={y + 4} textAnchor="end">
                {formatAxisValue((axisMaximum * (3 - index)) / 3)}
              </text>
            </g>
          ))}
          {areaPath ? (
            <path
              className="analytics-line-chart__area"
              d={areaPath}
              fill={`url(#${gradientId}-area)`}
            />
          ) : null}
          {linePath ? (
            <path
              className="analytics-line-chart__line"
              d={linePath}
              pathLength={1}
              filter={`url(#${gradientId}-shadow)`}
            />
          ) : null}
          {chartPoints.map((point, index) => {
            const isActive = index === activeIndex;
            const showLabel =
              index === 0 ||
              index === chartPoints.length - 1 ||
              index % labelInterval === 0;
            return (
              <g className="analytics-line-chart__point-group" key={point.label}>
                {isActive ? (
                  <line
                    className="analytics-line-chart__crosshair"
                    x1={point.x}
                    x2={point.x}
                    y1="38"
                    y2="206"
                  />
                ) : null}
                <circle
                  className="analytics-line-chart__hit-area"
                  cx={point.x}
                  cy={point.y}
                  r="14"
                  role="button"
                  tabIndex={0}
                  aria-label={`${point.label}: ${point.valueLabel}, ${point.detail}`}
                  aria-pressed={isActive}
                  onFocus={() => setActiveIndex(index)}
                  onBlur={() => setActiveIndex(null)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => setActiveIndex(index)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setActiveIndex(index);
                    }
                  }}
                />
                <circle
                  className={`analytics-line-chart__point-halo${isActive ? " is-active" : ""}`}
                  cx={point.x}
                  cy={point.y}
                  r={isActive ? "9" : "6"}
                />
                <circle
                  className="analytics-line-chart__point"
                  cx={point.x}
                  cy={point.y}
                  r={isActive ? "4.5" : "3"}
                />
                {showLabel ? (
                  <text
                    className="analytics-line-chart__date"
                    x={point.x}
                    y="236"
                    textAnchor="middle"
                  >
                    {point.label}
                  </text>
                ) : null}
              </g>
            );
          })}
          {activePoint ? (
            <g
              className="analytics-line-chart__tooltip"
              transform={`translate(${tooltipX} ${tooltipY})`}
              aria-hidden="true"
            >
              <rect width="168" height="62" rx="10" />
              <text className="analytics-line-chart__tooltip-date" x="12" y="17">
                {activePoint.label}
              </text>
              <text className="analytics-line-chart__tooltip-value" x="12" y="37">
                {activePoint.valueLabel}
              </text>
              <text className="analytics-line-chart__tooltip-detail" x="12" y="52">
                {activePoint.detail}
              </text>
            </g>
          ) : null}
        </svg>
      </div>
    </div>
  );
}
