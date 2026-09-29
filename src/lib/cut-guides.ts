import type { Settings } from './types';

export type GuidePoint = { x: number; y: number };
export type GuidePath = GuidePoint[];
export type GuideCard = { left: number; top: number; width: number; height: number };

export const manualGuideWidthMm = (settings: Pick<Settings, 'manualGuideWidthPx'>) =>
  (settings.manualGuideWidthPx * 25.4) / 96;

export const manualGuideDashMm = (settings: Pick<Settings, 'manualGuideWidthPx'>) => {
  const width = manualGuideWidthMm(settings);
  return [Math.max(0.9, width * 3), Math.max(0.65, width * 2)];
};

function unique(values: number[]) {
  return [...new Set(values.map((value) => value.toFixed(6)))].map(Number);
}

function arc(cx: number, cy: number, radius: number, start: number, end: number) {
  return Array.from({ length: 7 }, (_, index) => {
    const angle = start + ((end - start) * index) / 6;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}

function cardPaths(card: GuideCard, settings: Settings): GuidePath[] {
  const shift =
    settings.manualGuidePlacement === 'outside'
      ? manualGuideWidthMm(settings) / 2
      : settings.manualGuidePlacement === 'inside'
        ? -manualGuideWidthMm(settings) / 2
        : 0;
  const left = card.left - shift,
    top = card.top - shift,
    right = card.left + card.width + shift,
    bottom = card.top + card.height + shift,
    length = Math.min(settings.manualGuideLengthMm, (right - left) / 2, (bottom - top) / 2),
    radius = settings.manualGuideCornerStyle === 'round' ? Math.min(settings.radius, length, 6) : 0;
  if (settings.manualGuideCardStyle === 'full') {
    if (!radius)
      return [
        [
          { x: left, y: top },
          { x: right, y: top },
          { x: right, y: bottom },
          { x: left, y: bottom },
          { x: left, y: top },
        ],
      ];
    return [
      [
        { x: left + radius, y: top },
        { x: right - radius, y: top },
        ...arc(right - radius, top + radius, radius, -Math.PI / 2, 0).slice(1),
        { x: right, y: bottom - radius },
        ...arc(right - radius, bottom - radius, radius, 0, Math.PI / 2).slice(1),
        { x: left + radius, y: bottom },
        ...arc(left + radius, bottom - radius, radius, Math.PI / 2, Math.PI).slice(1),
        { x: left, y: top + radius },
        ...arc(left + radius, top + radius, radius, Math.PI, (3 * Math.PI) / 2).slice(1),
      ],
    ];
  }
  if (!radius)
    return [
      [
        { x: left + length, y: top },
        { x: left, y: top },
        { x: left, y: top + length },
      ],
      [
        { x: right - length, y: top },
        { x: right, y: top },
        { x: right, y: top + length },
      ],
      [
        { x: right, y: bottom - length },
        { x: right, y: bottom },
        { x: right - length, y: bottom },
      ],
      [
        { x: left + length, y: bottom },
        { x: left, y: bottom },
        { x: left, y: bottom - length },
      ],
    ];
  return [
    [
      { x: left + length, y: top },
      { x: left + radius, y: top },
      ...arc(left + radius, top + radius, radius, -Math.PI / 2, -Math.PI).slice(1),
      { x: left, y: top + length },
    ],
    [
      { x: right - length, y: top },
      { x: right - radius, y: top },
      ...arc(right - radius, top + radius, radius, -Math.PI / 2, 0).slice(1),
      { x: right, y: top + length },
    ],
    [
      { x: right, y: bottom - length },
      { x: right, y: bottom - radius },
      ...arc(right - radius, bottom - radius, radius, 0, Math.PI / 2).slice(1),
      { x: right - length, y: bottom },
    ],
    [
      { x: left + length, y: bottom },
      { x: left + radius, y: bottom },
      ...arc(left + radius, bottom - radius, radius, Math.PI / 2, Math.PI).slice(1),
      { x: left, y: bottom - length },
    ],
  ];
}

function pagePaths(
  cards: GuideCard[],
  paper: { width: number; height: number },
  style: Settings['manualGuidePageStyle'],
): GuidePath[] {
  if (style === 'none') return [];
  const vertical = unique(cards.flatMap(({ left, width }) => [left, left + width])).flatMap((x) => {
    if (style === 'full')
      return [
        [
          { x, y: 0 },
          { x, y: paper.height },
        ],
      ];
    const touching = cards.filter(
      ({ left, width }) => Math.abs(left - x) < 0.000001 || Math.abs(left + width - x) < 0.000001,
    );
    return [
      [
        { x, y: 0 },
        { x, y: Math.min(...touching.map(({ top }) => top)) },
      ],
      [
        { x, y: Math.max(...touching.map(({ top, height }) => top + height)) },
        { x, y: paper.height },
      ],
    ];
  });
  const horizontal = unique(cards.flatMap(({ top, height }) => [top, top + height])).flatMap(
    (y) => {
      if (style === 'full')
        return [
          [
            { x: 0, y },
            { x: paper.width, y },
          ],
        ];
      const touching = cards.filter(
        ({ top, height }) => Math.abs(top - y) < 0.000001 || Math.abs(top + height - y) < 0.000001,
      );
      return [
        [
          { x: 0, y },
          { x: Math.min(...touching.map(({ left }) => left)), y },
        ],
        [
          { x: Math.max(...touching.map(({ left, width }) => left + width)), y },
          { x: paper.width, y },
        ],
      ];
    },
  );
  return [...vertical, ...horizontal];
}

/** Physical guide geometry shared by the live sheet and PDF export. */
export function manualGuidePathsByKind(
  cards: GuideCard[],
  paper: { width: number; height: number },
  settings: Settings,
): { page: GuidePath[]; card: GuidePath[] } {
  if (!settings.manualGuidesEnabled || !cards.length) return { page: [], card: [] };
  return {
    page: pagePaths(cards, paper, settings.manualGuidePageStyle),
    card:
      settings.manualGuideCardStyle === 'none'
        ? []
        : cards.flatMap((card) => cardPaths(card, settings)),
  };
}

export function manualGuidePaths(
  cards: GuideCard[],
  paper: { width: number; height: number },
  settings: Settings,
): GuidePath[] {
  const { page, card } = manualGuidePathsByKind(cards, paper, settings);
  return [...page, ...card];
}
