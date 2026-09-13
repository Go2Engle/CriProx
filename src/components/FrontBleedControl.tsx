import { useEffect, useId, useRef, useState } from 'react';
import type { Settings } from '../lib/types';
import { formatLength, formatMeasurement } from '../lib/units';
import './FrontBleedControl.css';

export default function FrontBleedControl({
  settings,
  change,
}: {
  settings: Settings;
  change: (patch: Partial<Settings>) => void;
}) {
  const id = useId();
  const enabled = settings.bleed > 0;
  const remembered = useRef(enabled ? settings.bleed : 0.5);
  const maximum = Math.min(1.5, settings.gap / 2);
  const amount = enabled ? settings.bleed : Math.min(remembered.current, maximum);
  const [draft, setDraft] = useState(formatLength(amount, settings.units));
  const [error, setError] = useState('');
  useEffect(() => {
    if (settings.bleed > 0) remembered.current = settings.bleed;
    setDraft(formatLength(amount, settings.units));
    setError('');
  }, [amount, settings.bleed, settings.units]);

  function applyAmount() {
    const mm = Number(draft) * (settings.units === 'in' ? 25.4 : 1);
    // The display rounds inches; unchanged text must preserve exact millimeters.
    if (draft === formatLength(amount, settings.units)) return;
    if (!draft.trim() || !Number.isFinite(mm) || mm < 0.01 || mm > maximum + 0.0013) {
      setError(
        `Enter ${formatMeasurement(0.01, settings.units)} to ${formatMeasurement(maximum, settings.units)}.`,
      );
      return;
    }
    const value = Math.min(maximum, Math.round(mm * 10000) / 10000);
    remembered.current = value;
    setError('');
    change({ bleed: value });
  }

  return (
    <div className="setting-group front-bleed-control">
      <label className="switch-row">
        <span>
          Front artwork bleed
          <small>
            {enabled ? formatMeasurement(settings.bleed, settings.units) : 'Off'} · extends ink past
            the cut
          </small>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            if (enabled) remembered.current = settings.bleed;
            change({ bleed: event.target.checked ? Math.min(remembered.current, maximum) : 0 });
          }}
        />
        <span className="switch" />
      </label>
      {enabled && (
        <details className="bleed-advanced">
          <summary>Advanced bleed amount</summary>
          <label htmlFor={id}>Amount ({settings.units})</label>
          <input
            id={id}
            type="number"
            inputMode="decimal"
            step="any"
            min={settings.units === 'in' ? 0.0004 : 0.01}
            max={Number(formatLength(maximum, settings.units))}
            value={draft}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : `${id}-hint`}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={applyAmount}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applyAmount();
              }
            }}
          />
          <p id={`${id}-hint`} className="field-note">
            Maximum: {formatMeasurement(maximum, settings.units)}, limited by card spacing.
            {settings.profile !== 'seven' &&
              ` Standard default: ${formatMeasurement(0.5, settings.units)}.`}
          </p>
          {error && (
            <p id={`${id}-error`} role="alert">
              {error}
            </p>
          )}
        </details>
      )}
    </div>
  );
}
