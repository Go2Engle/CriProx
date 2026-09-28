import { useEffect, useId, useState } from 'react';
import { Ruler, Save } from 'lucide-react';
import { manualGuideDefaultsMatch } from '../lib/project-defaults';
import type { Settings } from '../lib/types';

export default function ManualGuideControls({
  settings,
  change,
  savedDefaults,
  saveDefaults,
  mode = 'project',
}: {
  settings: Settings;
  change: (patch: Partial<Settings>) => void;
  savedDefaults?: Settings;
  saveDefaults?: (settings: Settings) => Promise<void>;
  mode?: 'project' | 'defaults';
}) {
  const id = useId(),
    [colorText, setColorText] = useState(settings.manualGuideColor),
    [savingDefaults, setSavingDefaults] = useState(false),
    defaultsChanged =
      savedDefaults !== undefined && !manualGuideDefaultsMatch(settings, savedDefaults);
  useEffect(() => setColorText(settings.manualGuideColor), [settings.manualGuideColor]);
  const commitColor = () => {
    if (/^#[0-9a-f]{6}$/i.test(colorText)) change({ manualGuideColor: colorText });
    else setColorText(settings.manualGuideColor);
  };
  const choice = <K extends keyof Settings>(
    field: K,
    options: { value: Settings[K]; label: string }[],
    label: string,
  ) => (
    <div className="guide-choice" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className={settings[field] === option.value ? 'selected' : ''}
          aria-pressed={settings[field] === option.value}
          onClick={() => change({ [field]: option.value } as Partial<Settings>)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
  return (
    <section
      className={`manual-guide-controls ${mode === 'defaults' ? 'manual-guide-controls--defaults' : ''}`}
      aria-label={mode === 'defaults' ? 'Manual cut guide defaults' : 'Manual cut guides'}
    >
      {mode === 'project' && (
        <div className="section-label">
          <Ruler size={14} /> MANUAL CUT GUIDES
        </div>
      )}
      <label className="switch-row">
        <span>
          Show guides
          <small>
            {mode === 'defaults'
              ? 'Used by new manual cutting projects'
              : 'Updates the sheet preview and front PDF'}
          </small>
        </span>
        <input
          type="checkbox"
          checked={settings.manualGuidesEnabled}
          onChange={(event) => change({ manualGuidesEnabled: event.target.checked })}
        />
        <span className="switch" />
      </label>
      <div className="manual-guide-fields">
        <div className="setting-group">
          <label htmlFor={`${id}-color`}>Guide color</label>
          <div className="guide-color-row">
            <input
              aria-label="Pick guide color"
              type="color"
              value={settings.manualGuideColor}
              onChange={(event) => change({ manualGuideColor: event.target.value })}
            />
            <input
              id={`${id}-color`}
              aria-label="Guide color hex"
              type="text"
              maxLength={7}
              value={colorText}
              onChange={(event) => {
                const next = event.target.value;
                setColorText(next);
                if (/^#[0-9a-f]{6}$/i.test(next)) change({ manualGuideColor: next });
              }}
              onBlur={commitColor}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
          </div>
        </div>
        <div className="setting-group">
          <label htmlFor={`${id}-width`}>Guide width (px)</label>
          <input
            id={`${id}-width`}
            type="number"
            min="0.5"
            max="8"
            step="0.5"
            value={settings.manualGuideWidthPx}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (value >= 0.5 && value <= 8) change({ manualGuideWidthPx: value });
            }}
          />
          <p className="field-note">One pixel is 1/96 inch on the printed page.</p>
        </div>
        <div className="setting-group">
          <label>Placement</label>
          {choice(
            'manualGuidePlacement',
            [
              { value: 'outside', label: 'Outside' },
              { value: 'center', label: 'Center' },
              { value: 'inside', label: 'Inside' },
            ],
            'Card guide placement',
          )}
          <p className="field-note">Moves card guide strokes; page guides stay at the trim edge.</p>
        </div>
        <div className="setting-group">
          <label>Card cut guides</label>
          {choice(
            'manualGuideCardStyle',
            [
              { value: 'none', label: 'None' },
              { value: 'corners', label: 'Corners' },
              { value: 'full', label: 'Full' },
            ],
            'Card guide coverage',
          )}
        </div>
        <div className="setting-group">
          <label>Line style</label>
          {choice(
            'manualGuideLineStyle',
            [
              { value: 'solid', label: 'Solid' },
              { value: 'dashed', label: 'Dashed' },
            ],
            'Manual guide line style',
          )}
        </div>
        <div className="setting-group">
          <label>Card corners</label>
          {choice(
            'manualGuideCornerStyle',
            [
              { value: 'square', label: 'Square' },
              { value: 'round', label: 'Round' },
            ],
            'Card guide corner shape',
          )}
        </div>
        <div className="setting-group">
          <label htmlFor={`${id}-length`}>
            Corner guide length <span>{settings.manualGuideLengthMm.toFixed(1)} mm</span>
          </label>
          <input
            id={`${id}-length`}
            type="range"
            min="2.5"
            max="20"
            step="0.5"
            value={settings.manualGuideLengthMm}
            onChange={(event) => change({ manualGuideLengthMm: Number(event.target.value) })}
          />
        </div>
        <div className="setting-group">
          <label htmlFor={`${id}-page`}>Page cut guides</label>
          <select
            id={`${id}-page`}
            value={settings.manualGuidePageStyle}
            onChange={(event) =>
              change({
                manualGuidePageStyle: event.target.value as Settings['manualGuidePageStyle'],
              })
            }
          >
            <option value="none">None</option>
            <option value="edge">Marks to paper edge</option>
            <option value="full">Full lines across page</option>
          </select>
        </div>
        {saveDefaults && (
          <div className="guide-save-defaults">
            <button
              className="secondary compact"
              type="button"
              disabled={!defaultsChanged || savingDefaults}
              onClick={async () => {
                setSavingDefaults(true);
                try {
                  await saveDefaults(settings);
                } finally {
                  setSavingDefaults(false);
                }
              }}
            >
              <Save size={14} />
              {savingDefaults ? 'Saving guide defaults…' : 'Save guide settings as defaults'}
            </button>
            <p className="field-note">
              {defaultsChanged
                ? 'Saves guide options only; other project defaults stay the same.'
                : 'Guide settings already match the saved defaults.'}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
