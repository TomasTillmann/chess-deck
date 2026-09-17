import { useId, type ReactNode } from "react";
import type { ThemeProps } from "./theme";
import "./Statistics.css";

const count = new Intl.NumberFormat();
const axisCount = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 0 });

export function MetricStrip({ items, theme }: ThemeProps & {
  items: Array<{ label: string; value: ReactNode; detail?: string }>;
}) {
  return <dl className="ui-metric-strip" data-theme={theme}>
    {items.map(item => <div key={item.label}>
      <dt>{item.label}</dt>
      <dd>{item.value}</dd>
      {item.detail && <dd className="ui-metric-detail">{item.detail}</dd>}
    </div>)}
  </dl>;
}

export function BarChart({ label, points, tone = "accent", emptyMessage = "No reviews in this period.", theme }: ThemeProps & {
  label: string;
  points: Array<{ label: string; shortLabel?: string; value: number }>;
  tone?: "accent" | "warning";
  emptyMessage?: string;
}) {
  const id = useId();
  const maximum = Math.max(0, ...points.map(point => point.value));
  const roughStep = Math.max(1, maximum / 4);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = ([1, 2, 5, 10].find(value => value * magnitude >= roughStep) ?? 10) * magnitude;
  const ceiling = Math.max(1, Math.ceil(maximum / step)) * step;
  const ticks = Array.from({ length: ceiling / step + 1 }, (_, index) => index * step);
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const plotHeight = 160;
  const labelCount = Math.min(4, points.length);
  const labels = new Set(Array.from({ length: labelCount }, (_, index) =>
    Math.round(index * (points.length - 1) / Math.max(1, labelCount - 1))));

  return <div className={`ui-bar-chart ui-bar-chart--${tone}`} data-theme={theme}>
    <div className="ui-bar-chart-graphic">
      <svg width="42" height="204" aria-hidden="true">
        {ticks.map(tick => <text key={tick} x="32" y={12 + plotHeight * (1 - tick / ceiling)} textAnchor="end" dominantBaseline="middle" className="ui-chart-label">{axisCount.format(tick)}</text>)}
      </svg>
      <svg width="100%" height="204" className="ui-bar-chart-plot" role="img" aria-labelledby={`${id}-title ${id}-description`}>
        <title id={`${id}-title`}>{label}</title>
        <desc id={`${id}-description`}>{count.format(total)} total across {points.length} periods. Exact counts are available in the chart data below.</desc>
          {ticks.map(tick => <line key={tick} x1="0" x2="100%" y1={12 + plotHeight * (1 - tick / ceiling)} y2={12 + plotHeight * (1 - tick / ceiling)} className="ui-chart-grid" />)}
          {points.map((point, index) => <g key={`${point.label}-${index}`}>
            {point.value > 0 && <rect
              x={`${(index + 0.15) / points.length * 100}%`}
              y={12 + plotHeight * (1 - point.value / ceiling)}
              width={`${0.7 / points.length * 100}%`}
              height={plotHeight * point.value / ceiling}
              className="ui-chart-bar"
            ><title>{`${point.label}: ${count.format(point.value)}`}</title></rect>}
            {labels.has(index) && <text
              x={`${(index + 0.5) / points.length * 100}%`}
              y={plotHeight + 37}
              textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
              className="ui-chart-label"
            >{point.shortLabel ?? point.label}</text>}
          </g>)}
      </svg>
      {maximum === 0 && <p className="ui-chart-empty">{emptyMessage}</p>}
    </div>
    <details className="ui-chart-data">
      <summary>View chart data<span className="visually-hidden"> for {label}</span></summary>
      <div className="ui-chart-data-scroll" tabIndex={0} role="region" aria-label={`${label} data`}>
        <table>
          <caption className="visually-hidden">{label}</caption>
          <thead><tr><th scope="col">Period</th><th scope="col">Count</th></tr></thead>
          <tbody>{points.map((point, index) => <tr key={`${point.label}-${index}`}><th scope="row">{point.label}</th><td>{count.format(point.value)}</td></tr>)}</tbody>
        </table>
      </div>
    </details>
  </div>;
}

export function RatingBreakdown({ items, theme }: ThemeProps & {
  items: Array<{ label: string; value: number; tone: "success" | "warning" | "danger" }>;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return <div className="ui-rating-breakdown" data-theme={theme}>
    <div className="ui-rating-track" aria-hidden="true">
      {total > 0 && items.map(item => <span key={item.label} className={`ui-rating-segment ui-rating--${item.tone}`} style={{ width: `${item.value / total * 100}%` }} />)}
    </div>
    {total === 0 && <p className="ui-rating-empty">No ratings in this period.</p>}
    <ul className="ui-rating-legend">
      {items.map(item => <li key={item.label}>
        <span className="ui-rating-label"><span className={`ui-rating-key ui-rating--${item.tone}`} aria-hidden="true" />{item.label}</span>
        <span>{count.format(item.value)}</span>
        <span className="ui-rating-percent">{total > 0 ? Math.round(item.value / total * 100) : 0}%</span>
      </li>)}
    </ul>
  </div>;
}
