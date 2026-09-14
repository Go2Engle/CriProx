import { fixedBleedMm, type Settings } from '../lib/types';
import { formatMeasurement } from '../lib/units';
import './FrontBleedControl.css';

export default function FrontBleedControl({
  settings,
  change,
}: {
  settings: Settings;
  change: (patch: Partial<Settings>) => void;
}) {
  const enabled = settings.bleed > 0;
  const amount = fixedBleedMm(settings);

  return (
    <div className="setting-group front-bleed-control">
      <label className="switch-row">
        <span>
          Front artwork bleed
          <small>
            {enabled ? 'On' : 'Off'} · fixed {formatMeasurement(amount, settings.units)} extension
          </small>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => change({ bleed: event.target.checked ? amount : 0 })}
        />
        <span className="switch" />
      </label>
    </div>
  );
}
