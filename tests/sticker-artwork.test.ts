import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artworkPixelBounds, stickerArtworkFrame } from '../src/lib/sticker-artwork';
import { newStickerProject, validateStickerProject } from '../src/lib/stickers';

test('trim removes empty margins but retains edge pixels and faint antialiasing', () => {
  const pixels = new Uint8ClampedArray(100 * 50 * 4).fill(255);
  const paint = (x: number, y: number, color: number) => {
    const i = (y * 100 + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = color;
  };
  paint(10, 12, 0);
  paint(89, 37, 254);
  assert.deepEqual(artworkPixelBounds(pixels, 100, 50).trim, {
    x: 9,
    y: 11,
    width: 82,
    height: 28,
  });
  pixels.fill(0);
  assert.deepEqual(artworkPixelBounds(pixels, 100, 50).trim, {
    x: 0,
    y: 0,
    width: 100,
    height: 50,
  });
  pixels.set([255, 255, 255, 255], (20 * 100 + 90) * 4);
  pixels.set([0, 0, 0, 255], (20 * 100 + 10) * 4);
  assert.deepEqual(
    artworkPixelBounds(pixels, 100, 50).trim,
    { x: 9, y: 19, width: 83, height: 3 },
    'white artwork on transparency is retained',
  );
  pixels.fill(255);
  assert.deepEqual(artworkPixelBounds(pixels, 100, 50).trim, {
    x: 0,
    y: 0,
    width: 100,
    height: 50,
  });
});
test('wide imported labels fit completely inside narrow stickers with padding and optional stroke', () => {
  const info = { width: 425, height: 145, trim: { x: 5, y: 5, width: 415, height: 135 } };
  const pose = { width: 24, height: 14.5, radius: 1 };
  const f = stickerArtworkFrame(
    info,
    pose,
    { fit: 'cover', borderWidth: 1, borderStrokeWidth: 0.3 },
    false,
  );
  assert.deepEqual(f.source, info.trim);
  assert.ok(Math.abs(f.width / f.height - 415 / 135) < 1e-8);
  assert.ok(f.x >= 1.3 && f.y >= 1.3);
  assert.ok(f.x + f.width <= 24 - 1.3 + 1e-8);
  assert.ok(f.y + f.height <= 14.5 - 1.3 + 1e-8);
  const whole = stickerArtworkFrame(info, pose, { fit: 'contain' }, false);
  assert.deepEqual(whole.source, { x: 0, y: 0, width: 425, height: 145 });
  const custom = stickerArtworkFrame(
    info,
    pose,
    { fit: 'cover', borderWidth: 10, borderStrokeWidth: 2 },
    true,
  );
  assert.deepEqual(custom.source, whole.source);
  assert.equal(custom.x, 0, 'custom artwork retains its cut coordinate frame');
});
test('border settings persist and reject invalid sizes or colors', () => {
  const p = newStickerProject();
  p.settings = {
    ...p.settings,
    borderWidth: 1.5,
    borderStrokeWidth: 0.2,
    borderStrokeColor: '#112233',
  };
  assert.deepEqual(validateStickerProject(JSON.parse(JSON.stringify(p))).settings, p.settings);
  for (const patch of [
    { borderWidth: -1 },
    { borderStrokeWidth: NaN },
    { borderStrokeColor: 'red<script>' },
  ])
    assert.throws(() => validateStickerProject({ ...p, settings: { ...p.settings, ...patch } }));
});
