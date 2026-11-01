import type { ReactNode } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Scissors, ZoomIn, ZoomOut } from 'lucide-react';
import { MACHINE_NAMES, type Machine } from '../lib/machine-guides';
import { formatDimensions } from '../lib/units';

/** Shared editor shell: inputs, sheet, setup. The grid owns responsive ordering. */
export function WorkspaceGrid({ children }: { children: ReactNode }) {
  return <div className="studio-grid">{children}</div>;
}
export function WorkspacePanel({
  kind,
  children,
}: {
  kind: 'library' | 'preview-panel' | 'settings-panel';
  children: ReactNode;
}) {
  return <section className={`${kind} panel`}>{children}</section>;
}
export function WorkspacePanelHeading({
  title,
  icon,
  actions,
  badge,
}: {
  title: string;
  icon?: ReactNode;
  actions?: ReactNode;
  badge?: number;
}) {
  return (
    <div className="panel-heading">
      <h2>
        {icon}
        {title}
        {badge !== undefined && <span className="count-badge">{badge}</span>}
      </h2>
      {actions}
    </div>
  );
}
export function SheetNavigation({
  index,
  count,
  onChange,
}: {
  index: number;
  count: number;
  onChange: (index: number) => void;
}) {
  return (
    <div className="page-nav">
      <button
        className="icon-button"
        aria-label="Previous sheet"
        disabled={index <= 0}
        onClick={() => onChange(index - 1)}
      >
        <ChevronLeft size={17} />
      </button>
      <span>
        Sheet <strong>{count ? index + 1 : 0}</strong> of {count}
      </span>
      <button
        className="icon-button"
        aria-label="Next sheet"
        disabled={index >= count - 1}
        onClick={() => onChange(index + 1)}
      >
        <ChevronRight size={17} />
      </button>
    </div>
  );
}
export function ZoomControl({
  value,
  onChange,
  min = 70,
  max = 400,
  step = 10,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="zoom-control">
      <button
        aria-label="Zoom out"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        <ZoomOut size={15} />
      </button>
      <span>{Math.round(value)}%</span>
      <button
        aria-label="Zoom in"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
      >
        <ZoomIn size={15} />
      </button>
    </div>
  );
}
export function MachineSelect({
  id,
  value,
  onChange,
  allowManual = true,
}: {
  id: string;
  value: Machine;
  onChange: (machine: Machine) => void;
  allowManual?: boolean;
}) {
  return (
    <div className="setting-group">
      <label htmlFor={id}>Cutting method</label>
      <div className="select-wrap">
        <Scissors size={15} />
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as Machine)}>
          {Object.entries(MACHINE_NAMES)
            .filter(([key]) => allowManual || key !== 'manual')
            .map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}
export function PaperOptions({
  value,
  onChange,
  units = 'mm',
}: {
  value: 'letter' | 'a4';
  onChange: (paper: 'letter' | 'a4') => void;
  units: 'mm' | 'in';
}) {
  return (
    <div className="setting-group">
      <label>Paper size</label>
      <div className="paper-options">
        {(['letter', 'a4'] as const).map((paper) => (
          <button
            key={paper}
            className={value === paper ? 'chosen' : ''}
            aria-pressed={value === paper}
            onClick={() => onChange(paper)}
          >
            <span className={`paper-mini ${paper === 'a4' ? 'a4' : ''}`} />
            <strong>{paper === 'letter' ? 'US Letter' : 'A4'}</strong>
            <small>
              {paper === 'letter'
                ? formatDimensions(215.9, 279.4, units)
                : formatDimensions(210, 297, units)}
            </small>
            {value === paper && <CheckCircle2 size={13} />}
          </button>
        ))}
      </div>
    </div>
  );
}
