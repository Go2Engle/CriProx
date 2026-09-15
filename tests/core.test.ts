import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeck } from '../src/lib/deck';
import { parseArchidektDeck, parseDeckSource, parseMoxfieldDeck } from '../src/lib/deck-source';
import { envelope, grid, layout, mmToPx, templateSvg } from '../src/lib/layout';
import { formatDimensions, formatMeasurement } from '../src/lib/units';
import { projectFilename } from '../src/lib/save-project';
import {
  backBleedMm,
  DEFAULT_SETTINGS,
  fixedBleedMm,
  frontBleedMm,
  PRINT_DPI_OPTIONS,
  type Entry,
} from '../src/lib/types';
import { validateProject } from '../src/lib/project';
import { withDpi } from '../src/lib/png';
import { mpcArtworkAsCard, normalizeMpcArtwork } from '../src/lib/mpc';
import { cardMatchesDeckLine, scryfallLookupName, scryfallSearchPath } from '../src/lib/scryfall';
import { artworkSourceAtDpi, fitArtwork } from '../src/lib/export';
import { paperWorkflow } from '../src/lib/paper-workflow';
const entry: Entry = {
  id: 'entry-1',
  quantity: 1,
  face: 0,
  card: {
    id: 'card-1',
    name: 'Sol Ring',
    set: 'cmm',
    setName: 'Commander Masters',
    collector: '396',
    faces: [
      {
        name: 'Sol Ring',
        image: 'https://cards.scryfall.io/example.png',
        preview: 'https://cards.scryfall.io/example.png',
      },
    ],
  },
};
test('deck parser accepts counts, suffix x, set and collector numbers, foil suffix, split names and headings', () => {
  const result = parseDeck(
    'Deck\n4 Lightning Bolt\n2x Counterspell (MH2) 267\n1 Fire // Ice\nSol Ring\n1 Plains (UNF) 240 *F*\n# note\nSideboard\n1 Negate',
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.cards.length, 6);
  assert.deepEqual(result.cards[1], {
    quantity: 2,
    name: 'Counterspell',
    set: 'mh2',
    collector: '267',
    line: 3,
  });
  assert.equal(result.cards[2].name, 'Fire // Ice');
  assert.equal(result.cards[3].quantity, 1);
  assert.equal(result.cards[4].collector, '240');
});
test('double-faced deck names use the front face for Scryfall lookup and retain full-name matching', () => {
  const names = [
    'Ashling, Rekindled // Ashling, Rimebound',
    "Gandalf, Goblins' Bane // Flameshape",
    'Hydroelectric Specimen // Hydroelectric Laboratory',
    'Pinnacle Monk // Mystic Peak',
    'Silundi Vision // Silundi Isle',
    'Sink into Stupor // Soporific Springs',
    'The Emperor of Palamecia // The Lord Master of Hell',
    'Valakut Awakening // Valakut Stoneforge',
    'Venat, Heart of Hydaelyn // Hydaelyn, the Mothercrystal',
  ];
  for (const name of names) {
    assert.equal(scryfallLookupName(name), name.split(' // ')[0]);
    assert.ok(
      cardMatchesDeckLine(
        {
          ...entry.card,
          name,
          faces: name.split(' // ').map((face) => ({ ...entry.card.faces[0], name: face })),
        },
        { name, quantity: 1, line: 1 },
      ),
    );
  }
  assert.equal(scryfallLookupName('Silundi Vision//Silundi Isle'), 'Silundi Vision');
});
test('single-card search constrains partial names to paper cards', () => {
  assert.equal(
    scryfallSearchPath('  Sol Ring  '),
    '/cards/search?q=name%3A%22Sol%20Ring%22%20game%3Apaper&unique=cards&order=name',
  );
  assert.equal(
    decodeURIComponent(scryfallSearchPath("Gandalf, Goblins' Bane")),
    '/cards/search?q=name:"Gandalf, Goblins\' Bane" game:paper&unique=cards&order=name',
  );
  assert.throws(() => scryfallSearchPath('   '), /card name/);
});
test('deck parser rejects unreasonable counts and caps total', () => {
  assert.equal(parseDeck('0 Island\n101 Forest').errors.length, 2);
  assert.match(parseDeck(Array(6).fill('100 Forest').join('\n')).errors.join(' '), /500/);
  assert.equal(parseDeck('  \n// comment').cards.length, 0);
});
test('deck source parser accepts Moxfield and Archidekt deck links only', () => {
  assert.deepEqual(parseDeckSource('https://www.moxfield.com/decks/abc_DEF-123?foo=bar'), {
    provider: 'moxfield',
    id: 'abc_DEF-123',
  });
  assert.deepEqual(parseDeckSource('https://archidekt.com/decks/14420275/example-deck'), {
    provider: 'archidekt',
    id: '14420275',
  });
  assert.throws(() => parseDeckSource('http://moxfield.com/decks/abc'), /https/);
  assert.throws(() => parseDeckSource('https://example.com/decks/123'), /Moxfield or Archidekt/);
  assert.throws(() => parseDeckSource('https://archidekt.com/folders/123'), /deck link/);
});
test('Moxfield import keeps active boards and selected printings but excludes maybeboards', () => {
  const result = parseMoxfieldDeck({
    name: 'Artifacts',
    boards: {
      commanders: {
        cards: {
          commander: {
            quantity: 1,
            card: { name: 'Urza, Lord High Artificer', set: 'mh1', cn: '75' },
          },
        },
      },
      mainboard: {
        cards: {
          ring: { quantity: 1, card: { name: 'Sol Ring', set: 'cmm', cn: '396' } },
          island: { quantity: 10, card: { name: 'Island', set: 'dmu', cn: '278' } },
        },
      },
      sideboard: { cards: { wish: { quantity: 1, card: { name: 'Karn, the Great Creator' } } } },
      signatureSpells: {
        cards: {
          spell: { quantity: 1, card: { name: 'Whir of Invention', set: 'aer', cn: '49' } },
        },
      },
      maybeboard: { cards: { maybe: { quantity: 1, card: { name: 'Mana Crypt' } } } },
      tokens: { cards: { token: { quantity: 1, card: { name: 'Construct' } } } },
    },
  });
  assert.equal(result.name, 'Artifacts');
  assert.deepEqual(
    result.cards.map(({ name, quantity, set, collector }) => ({ name, quantity, set, collector })),
    [
      { name: 'Urza, Lord High Artificer', quantity: 1, set: 'mh1', collector: '75' },
      { name: 'Whir of Invention', quantity: 1, set: 'aer', collector: '49' },
      { name: 'Sol Ring', quantity: 1, set: 'cmm', collector: '396' },
      { name: 'Island', quantity: 10, set: 'dmu', collector: '278' },
      { name: 'Karn, the Great Creator', quantity: 1, set: undefined, collector: undefined },
    ],
  );
});
test('Archidekt import reads oracle names and excludes deleted and maybeboard cards', () => {
  const result = parseArchidektDeck({
    name: 'Counters',
    cards: [
      {
        quantity: 1,
        categories: ['Commander'],
        deletedAt: null,
        card: {
          collectorNumber: '3',
          edition: { editioncode: 'EOC' },
          oracleCard: { name: 'Kilo, Apogee Mind' },
        },
      },
      {
        quantity: 2,
        categories: ['Artifact'],
        deletedAt: null,
        card: {
          collectorNumber: '53',
          edition: { editioncode: 'EOC' },
          oracleCard: { name: 'Arcane Signet' },
        },
      },
      {
        quantity: 1,
        categories: ['Maybeboard'],
        card: { oracleCard: { name: 'Lux Cannon' } },
      },
      {
        quantity: 1,
        categories: [],
        deletedAt: '2026-01-01T00:00:00Z',
        card: { oracleCard: { name: 'Contagion Engine' } },
      },
    ],
  });
  assert.equal(result.name, 'Counters');
  assert.deepEqual(result.cards, [
    { name: 'Kilo, Apogee Mind', quantity: 1, set: 'eoc', collector: '3', line: 1 },
    { name: 'Arcane Signet', quantity: 2, set: 'eoc', collector: '53', line: 2 },
  ]);
});
test('layout preserves requested quantity over full and partial sheets without stretching', () => {
  const settings = DEFAULT_SETTINGS;
  const pages = layout([{ ...entry, quantity: 9 }], settings);
  assert.deepEqual(
    pages.map((p) => p.placements.length),
    [6, 3],
  );
  assert.equal(pages[0].width, 177);
  assert.equal(pages[0].height, 191);
  assert.equal(pages[1].width, 177);
  assert.equal(pages[1].height, 127);
  assert.equal(pages.flatMap((s) => s.placements).length, 9);
  assert.deepEqual(layout([], DEFAULT_SETTINGS), []);
});
test('default layout uses TCG dimensions and six rounded cut slots', () => {
  const settings = DEFAULT_SETTINGS;
  const pages = layout([{ ...entry, quantity: 6 }], settings);
  assert.equal(grid(settings).capacity, 6);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].width, 177);
  assert.equal(pages[0].height, 191);
  assert.ok(pages[0].placements.every((p) => p.rotated));
  const svg = templateSvg(pages[0], settings);
  assert.equal((svg.match(/<rect /g) || []).length, 6);
  assert.match(svg, /width="177mm" height="191mm"/);
  assert.equal(settings.width, 63);
  assert.equal(settings.height, 88);
  assert.equal(settings.radius, 3);
  assert.equal(settings.gap, 1);
  assert.equal(settings.bleed, 0.5);
  assert.equal(settings.proxyLabel, false);
  assert.match(svg, /rx="3" ry="3"/);
  assert.ok(!/image|clipPath|stroke/.test(svg));
});
test('experimental seven-card layout uses the proven 2-3-2 Letter geometry', () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    profile: 'seven' as const,
    gap: 0.1,
    bleed: 0.05,
  };
  const pages = layout([{ ...entry, quantity: 17 }], settings);
  assert.equal(grid(settings).capacity, 7);
  assert.deepEqual(
    pages.map((page) => page.placements.length),
    [7, 7, 3],
  );
  assert.ok(pages.every((page) => page.width === 189.2 && page.height === 214.2));
  assert.deepEqual(
    pages[0].placements.map(({ x, y, width, height, rotated }) => ({
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      width,
      height,
      rotated,
    })),
    [
      { x: 6.55, y: 0, width: 88, height: 63, rotated: true },
      { x: 94.65, y: 0, width: 88, height: 63, rotated: true },
      { x: 0, y: 63.1, width: 63, height: 88, rotated: false },
      { x: 63.1, y: 63.1, width: 63, height: 88, rotated: false },
      { x: 126.2, y: 63.1, width: 63, height: 88, rotated: false },
      { x: 6.55, y: 151.2, width: 88, height: 63, rotated: true },
      { x: 94.65, y: 151.2, width: 88, height: 63, rotated: true },
    ],
  );
  const svg = templateSvg(pages[0], settings);
  assert.equal((svg.match(/<rect /g) || []).length, 7);
  assert.match(svg, /width="189\.2mm" height="214\.2mm"/);
});
test('all supported settings place cards inside the planning envelope, without overlaps', () => {
  for (const gap of [1, 3, 10])
    for (const width of [63, 63.5]) {
      const settings = {
        ...DEFAULT_SETTINGS,
        gap,
        width,
        height: width === 63 ? 88 : 88.9,
      };
      const bounds = envelope(settings);
      for (const sheet of layout([{ ...entry, quantity: 17 }], settings)) {
        assert.ok(sheet.width <= bounds.width && sheet.height <= bounds.height);
        for (const p of sheet.placements) {
          assert.ok(
            p.x >= 0 &&
              p.y >= 0 &&
              p.x + p.width <= sheet.width + 1e-8 &&
              p.y + p.height <= sheet.height + 1e-8,
          );
          for (const q of sheet.placements)
            if (p !== q)
              assert.ok(
                p.x + p.width <= q.x ||
                  q.x + q.width <= p.x ||
                  p.y + p.height <= q.y ||
                  q.y + q.height <= p.y,
              );
        }
      }
    }
});
test('PNG quantization stays within half a pixel in physical units', () => {
  for (const dpi of PRINT_DPI_OPTIONS)
    for (const mm of [63, 88, 88.9, 127, 177, 189.2, 191, 214.2])
      assert.ok(Math.abs((mmToPx(mm, dpi) * 25.4) / dpi - mm) <= 25.4 / dpi / 2);
});
test('display units convert labels without changing millimeter geometry', () => {
  assert.equal(formatDimensions(63.5, 88.9, 'in'), '2.5 × 3.5 in');
  assert.equal(formatDimensions(63.5, 88.9, 'mm'), '63.5 × 88.9 mm');
  assert.equal(formatMeasurement(3, 'in'), '0.1181 in');
});
test('bleed amounts are fixed by layout profile', () => {
  assert.equal(fixedBleedMm(DEFAULT_SETTINGS), 0.5);
  assert.equal(fixedBleedMm({ profile: 'seven' }), 0.05);
  assert.equal(frontBleedMm({ profile: 'expanded', bleed: 0 }), 0);
  assert.equal(frontBleedMm({ profile: 'expanded', bleed: 1.25 }), 0.5);
  assert.equal(backBleedMm({ profile: 'expanded', backBleedEnabled: true }), 0.5);
  assert.equal(backBleedMm({ profile: 'expanded', backBleedEnabled: false }), 0);
  assert.equal(backBleedMm({ profile: 'seven', backBleedEnabled: true }), 0.05);
});
test('paper workflow uses Tabloid for Letter hacks and native A4 for A4 output', () => {
  assert.deepEqual(paperWorkflow({ paper: 'letter', profile: 'expanded' }), {
    designSpacePaper: 'Tabloid (11 × 17 in)',
    systemPaper: 'US Letter',
    usesLetterHack: true,
  });
  assert.deepEqual(paperWorkflow({ paper: 'letter', profile: 'seven' }), {
    designSpacePaper: 'Tabloid (11 × 17 in)',
    systemPaper: 'US Letter',
    usesLetterHack: true,
  });
  assert.deepEqual(paperWorkflow({ paper: 'a4', profile: 'expanded' }), {
    designSpacePaper: 'A4',
    systemPaper: 'A4',
    usesLetterHack: false,
  });
});
test('project Save As names are portable across desktop platforms', () => {
  assert.equal(projectFilename('My Commander: Deck / 2026'), 'My-Commander-Deck-2026.criprox.json');
  assert.equal(projectFilename('...'), 'project.criprox.json');
});
test('PNG metadata contains one correctly ordered physical density chunk', () => {
  const source = new Uint8Array(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRfoAAAAASUVORK5CYII=',
      'base64',
    ),
  );
  const out = withDpi(withDpi(source, 300), 600);
  const types = [],
    view = new DataView(out.buffer);
  for (let i = 8; i < out.length;) {
    const type = new TextDecoder().decode(out.slice(i + 4, i + 8));
    types.push(type);
    if (type === 'pHYs') {
      assert.equal(view.getUint32(i + 8), Math.round(600 / 0.0254));
      assert.equal(out[i + 16], 1);
    }
    i += view.getUint32(i) + 12;
  }
  assert.deepEqual(types, ['IHDR', 'pHYs', 'IDAT', 'IEND']);
});
test('project import validates geometry, IDs, totals, image schemes and selected face', () => {
  const good = { version: 1, name: 'Example', entries: [entry], settings: DEFAULT_SETTINGS };
  assert.equal(validateProject(good).name, 'Example');
  const {
    units: _oldUnits,
    bleed: _oldBleed,
    backBleedEnabled: _oldBackBleed,
    backsEnabled: _oldBacks,
    backPrintMode: _oldBackMode,
    backFlip: _oldBackFlip,
    backRotation: _oldBackRotation,
    backOffsetX: _oldBackX,
    backOffsetY: _oldBackY,
    ...oldSettings
  } = DEFAULT_SETTINGS;
  const migrated = validateProject({ ...good, settings: oldSettings });
  assert.equal(migrated.settings.units, 'in');
  assert.equal(migrated.settings.bleed, 0);
  assert.equal(migrated.settings.backBleedEnabled, true);
  assert.equal(migrated.settings.backsEnabled, false);
  assert.equal(migrated.settings.backPrintMode, 'manual');
  assert.equal(migrated.settings.backRotation, 180);
  const legacyFour = validateProject({
    ...good,
    settings: { ...DEFAULT_SETTINGS, profile: 'conservative' },
  } as unknown);
  assert.equal(legacyFour.settings.profile, 'expanded');
  assert.equal(
    validateProject({ ...good, settings: { ...DEFAULT_SETTINGS, bleed: 1.25 } }).settings.bleed,
    0.5,
  );
  for (const dpi of PRINT_DPI_OPTIONS)
    assert.equal(
      validateProject({ ...good, settings: { ...DEFAULT_SETTINGS, dpi } }).settings.dpi,
      dpi,
    );
  assert.throws(() => validateProject({ ...good, settings: { ...DEFAULT_SETTINGS, dpi: 1500 } }));
  assert.throws(() => validateProject({ ...good, settings: { ...DEFAULT_SETTINGS, gap: -3 } }));
  const seven = {
    ...DEFAULT_SETTINGS,
    profile: 'seven' as const,
    gap: 0.1,
    bleed: 0.05,
  };
  assert.equal(validateProject({ ...good, settings: seven }).settings.profile, 'seven');
  assert.throws(() =>
    validateProject({ ...good, settings: { ...seven, machine: 'joy-xtra' as const } }),
  );
  assert.throws(() => validateProject({ ...good, settings: { ...seven, paper: 'a4' as const } }));
  assert.throws(() => validateProject({ ...good, settings: { ...seven, gap: 1 } }));
  assert.throws(() => validateProject({ ...good, entries: [entry, entry] }));
  assert.throws(() => validateProject({ ...good, entries: [{ ...entry, face: 2 }] }));
  assert.throws(() =>
    validateProject({
      ...good,
      entries: [
        {
          ...entry,
          card: {
            ...entry.card,
            faces: [{ name: 'x', image: 'javascript:alert(1)', preview: 'file:///secret' }],
          },
        },
      ],
    }),
  );
});
test('MPC Autofill artwork uses the official image CDN and remains valid in saved projects', () => {
  const artwork = normalizeMpcArtwork({
    identifier: 'drive_id-1',
    name: 'Sol Ring (Community Render)',
    sourceName: 'Example Artist',
    sourceType: 'Google Drive',
    dpi: 1200,
  });
  assert.match(
    artwork.face.image,
    /^https:\/\/cdn\.mpcautofill\.com\/images\/google_drive\/full\//,
  );
  assert.match(artwork.face.image, /[?&]dpi=1200(?:&|$)/);
  assert.match(artwork.face.preview, /\/large\//);
  const card = mpcArtworkAsCard(artwork, 'Sol Ring');
  const project = {
    version: 1 as const,
    name: 'MPC art',
    entries: [{ ...entry, card }],
    settings: DEFAULT_SETTINGS,
    backArtwork: artwork.face,
  };
  assert.equal(validateProject(project).entries[0].card.set, 'mpc');
});

test('higher-resolution exports upgrade legacy MPC source requests without changing other art', () => {
  const legacy =
    'https://cdn.mpcautofill.com/images/google_drive/full/drive-id.jpg?dpi=600&jpgQuality=95';
  assert.match(artworkSourceAtDpi(legacy, 1200), /[?&]dpi=1200(?:&|$)/);
  assert.match(artworkSourceAtDpi(legacy, 300), /[?&]dpi=600(?:&|$)/);
  const scryfall = 'https://cards.scryfall.io/large/front/example.jpg';
  assert.equal(artworkSourceAtDpi(scryfall, 1200), scryfall);
});

test('cover artwork fills card and bleed bounds without exposing backing bars', () => {
  const card = fitArtwork(816, 1110, 63, 88, 'cover');
  assert.ok(card.width >= 63 && card.height >= 88);
  assert.equal(card.height, 88);
  assert.ok(card.x < 0);

  const bleed = fitArtwork(816, 1110, 66, 91, 'cover');
  assert.ok(bleed.width >= 66 && bleed.height >= 91);
  assert.equal(bleed.height, 91);
  assert.ok(bleed.x < 0);

  const contained = fitArtwork(816, 1110, 63, 88, 'contain');
  assert.ok(contained.height < 88);
  assert.equal(contained.width, 63);
});
