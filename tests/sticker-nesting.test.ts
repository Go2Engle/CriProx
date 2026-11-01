import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { newDesign, newElement, designSvg, validateStickerDesign } from '../src/lib/sticker-design';
import { designOutputBounds, stickerLocalCuts } from '../src/lib/sticker-cuts';
import {
  newStickerProject,
  appendSticker,
  fillStickerSheet,
  arrangeStickers,
  hasStickerOverlap,
  parseStickerProject,
} from '../src/lib/stickers';
import {
  stickerFootprint,
  footprintsConflict,
  nestingCandidates,
} from '../src/lib/sticker-nesting';
import { artworkHull, fittedDesignFromHull } from '../src/lib/sticker-fit-cut';
import { machineGuide, outsidePlanningGuide } from '../src/lib/machine-guides';

function circle(diameter = 30) {
  const design = { ...newDesign(diameter + 20, diameter + 20), cropToCuts: true };
  design.elements = [
    {
      ...newElement('shape', design),
      operation: 'cut',
      shape: 'ellipse',
      x: 10,
      y: 10,
      width: diameter,
      height: diameter,
    },
  ];
  let project = newStickerProject();
  project.artwork = [{ id: 'circle', name: 'Circle', image: 'data:image/png;base64,AAAA', design }];
  return { design, project: appendSticker(project, 'circle') };
}
test('saved outlines trim sheet dimensions without destroying the editable canvas or changing cut scale', async () => {
  const { design, project } = circle();
  assert.deepEqual(designOutputBounds(design), { x: 10, y: 10, width: 30, height: 30 });
  assert.equal(project.poses![0].width, 30);
  assert.equal(project.poses![0].height, 30);
  const loaded = parseStickerProject(JSON.stringify(project));
  assert.equal(loaded.artwork[0].design!.width, 50);
  assert.equal(loaded.artwork[0].design!.elements[0].x, 10);
  assert.equal(loaded.artwork[0].design!.cropToCuts, true);
  const paths = stickerLocalCuts(design, project.poses![0], 'contain');
  assert.deepEqual(paths[0].points[0], { x: 30, y: 15 });
  const image = await loadImage(Buffer.from(designSvg(design)));
  const canvas = createCanvas(300, 300),
    ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, 300, 300);
  assert.equal(ctx.getImageData(0, 0, 1, 1).data[3], 0, 'transparent outside circle');
  assert.deepEqual(Array.from(ctx.getImageData(150, 150, 1, 1).data), [255, 255, 255, 255]);
  assert.deepEqual(
    designOutputBounds({ ...design, cropToCuts: undefined }),
    { x: 0, y: 0, width: 50, height: 50 },
    'old designs keep their printed frame',
  );
  assert.throws(() => validateStickerDesign({ ...design, cropToCuts: 'yes' }), /Invalid/);
});
test('circle fill staggers contours, keeps spacing and machine clearance, and preserves placed copies', () => {
  const { project } = circle();
  const first = { ...project.poses![0] };
  const filled = fillStickerSheet(project, 'circle');
  assert.deepEqual(filled.poses![0], first);
  assert.ok(
    filled.items.length > 30,
    `expected more than 30 rectangular slots, got ${filled.items.length}`,
  );
  assert.equal(hasStickerOverlap(filled), false);
  const guide = machineGuide(filled.machine, filled.settings.paper);
  const left = (guide.page.width - filled.settings.areaWidth) / 2,
    top = (guide.page.height - filled.settings.areaHeight) / 2;
  let sharedBounds = false;
  for (const [i, p] of filled.poses!.entries()) {
    assert.equal(
      outsidePlanningGuide(
        { x: p.x + left, y: p.y + top, width: p.width, height: p.height },
        guide,
      ),
      false,
    );
    for (const q of filled.poses!.slice(i + 1)) {
      assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= 32 - 1e-6);
      if (Math.abs(p.x - q.x) < 30 && Math.abs(p.y - q.y) < 30) sharedBounds = true;
    }
  }
  assert.equal(sharedBounds, true);
  assert.equal(fillStickerSheet(filled, 'circle'), filled);
  assert.deepEqual(arrangeStickers(filled).items, filled.items);
  assert.equal(hasStickerOverlap(arrangeStickers(filled)), false);
});
test('fill retains the grid when staggering would fit fewer circles', () => {
  const { project } = circle(40);
  assert.ok(fillStickerSheet(project, 'circle').items.length >= 20);
});
test('contour collision checks recognize concave gaps, containment, crossed edges and clearance', () => {
  const l = {
    width: 20,
    height: 20,
    paths: [
      {
        closed: true,
        points: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 5 },
          { x: 5, y: 5 },
          { x: 5, y: 20 },
          { x: 0, y: 20 },
        ],
      },
    ],
  };
  const square = {
    width: 4,
    height: 4,
    paths: [
      {
        closed: true,
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 4 },
          { x: 0, y: 4 },
        ],
      },
    ],
  };
  assert.equal(footprintsConflict(l, 0, 0, square, 8, 8, 2), false);
  assert.equal(footprintsConflict(l, 0, 0, square, 6, 6, 2), true);
  assert.equal(footprintsConflict(l, 0, 0, square, 0.5, 8), true);
  const line = {
    width: 20,
    height: 20,
    paths: [
      {
        closed: false,
        points: [
          { x: 0, y: 0 },
          { x: 20, y: 20 },
        ],
      },
    ],
  };
  assert.equal(footprintsConflict(line, 0, 0, square, 8, 8), true);
  const { project } = circle();
  const pose = { ...project.poses![0], rotation: 90, flipX: true, flipY: true };
  const shape = stickerFootprint(project.artwork[0], pose, 'contain');
  assert.ok(shape.circle);
  assert.equal(footprintsConflict(shape, 0, 0, shape, 16, 16, 2), true);
});
test('multiple outlines use their combined bounds and open-only designs retain the canvas', () => {
  const { design } = circle();
  design.elements.push({ ...design.elements[0], id: 'second', x: 1, y: 2, width: 4, height: 6 });
  assert.deepEqual(designOutputBounds(design), { x: 1, y: 2, width: 39, height: 38 });
  design.elements = [
    { ...newElement('line', design), operation: 'cut', x: 5, y: 5, width: 20, height: 1 },
  ];
  assert.deepEqual(designOutputBounds(design), { x: 0, y: 0, width: 50, height: 50 });
});

test('matching ovals use compact contact candidates and preserve conservative contour clearance', () => {
  const { project, design } = circle();
  design.elements[0].height = 15;
  const pose = { ...project.poses![0], width: 30, height: 15 };
  const f = stickerFootprint(project.artwork[0], pose, 'contain');
  assert.ok(f.ellipse && !f.circle);
  const reference = { ...f, ellipse: undefined };
  for (const [x, y] of [
    [31, 0],
    [0, 17],
    [20, 14],
    [29, 9],
    [18, 16],
    [30, 15],
    [25, 12],
  ]) {
    const conflict = footprintsConflict(f, 0, 0, f, x, y, 2);
    if (!conflict)
      assert.equal(
        footprintsConflict(reference, 0, 0, reference, x, y, 2),
        false,
        'fast clearances must also clear actual polygons',
      );
  }
});
test('an exhausted nesting budget falls back to a safe grid with progress', () => {
  const { project } = circle();
  const filled = fillStickerSheet(project, 'circle');
  let limited = false,
    updates = 0;
  const result = arrangeStickers(filled, {
    nestingBudgetMs: -1,
    limited: () => {
      limited = true;
    },
    progress: () => {
      updates++;
    },
  });
  assert.ok(limited && updates > 0);
  assert.equal(result.items.length, filled.items.length);
  assert.equal(hasStickerOverlap(result), false);
});

test('fast convex clearance agrees with exact contours for fitted borders and tangent contacts', () => {
  const { project, design } = circle();
  const hull = artworkHull(
    Array.from({ length: 80 }, (_, i) => ({
      x: 25 + Math.cos((i * Math.PI) / 40) * 14,
      y: 25 + Math.sin((i * Math.PI) / 40) * 7,
    })),
  );
  const fitted = fittedDesignFromHull(design, hull, {
    borderWidth: 1,
    strokeWidth: 0.2,
    strokeColor: '#000000',
  });
  const b = designOutputBounds(fitted),
    pose = { ...project.poses![0], width: b.width, height: b.height };
  const shape = stickerFootprint({ ...project.artwork[0], design: fitted }, pose, 'contain');
  assert.ok(shape.convex);
  const reference = { ...shape, convex: undefined };
  let seed = 12345;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 150; i++) {
    const x = (random() - 0.5) * 80,
      y = (random() - 0.5) * 50,
      gap = i % 3 ? 2 : 0;
    assert.equal(
      footprintsConflict(shape, 0, 0, shape, x, y, gap),
      footprintsConflict(reference, 0, 0, reference, x, y, gap),
    );
  }
  const contacts = nestingCandidates(
    shape,
    [{ pose: { ...pose, x: 0, y: 0 }, footprint: shape }],
    2,
  );
  assert.equal(
    contacts.length,
    24,
    'contact count stays bounded instead of multiplying all vertices',
  );
  for (const p of contacts)
    assert.equal(
      footprintsConflict(shape, 0, 0, shape, p.x, p.y, 2),
      footprintsConflict(reference, 0, 0, reference, p.x, p.y, 2),
    );
});
