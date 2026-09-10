/** Fill only exterior transparent source corners from the neighboring opaque
 * contour. Inverse-distance weights produce a continuous color field instead
 * of a constant patch or scan-line streaks. Opaque artwork is never changed.
 * This approximates missing pixels; it does not invent missing illustration.
 */
export function repairTransparentCorners(pixels: Uint8ClampedArray, width: number, height: number) {
  const size = Math.ceil(Math.min(width, height) * 0.1);
  for (const [originX, originY, directionX, directionY] of [
    [0, 0, 1, 1],
    [width - 1, 0, -1, 1],
    [0, height - 1, 1, -1],
    [width - 1, height - 1, -1, -1],
  ]) {
    const offset = (x: number, y: number) =>
      ((originY + directionY * y) * width + originX + directionX * x) * 4;
    if (pixels[offset(0, 0) + 3] === 255) continue;
    const visited = new Uint8Array(size * size);
    const missing: number[] = [0];
    const boundary: { x: number; y: number; offset: number }[] = [];
    visited[0] = 1;
    // Only transparency connected to the actual outside corner is eligible.
    // Transparent details inside the source image are not used as repair masks.
    for (let i = 0; i < missing.length; i++) {
      const x = missing[i] % size,
        y = Math.floor(missing[i] / size);
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        const index = ny * size + nx;
        if (visited[index]) continue;
        visited[index] = 1;
        const at = offset(nx, ny);
        if (pixels[at + 3] === 255) boundary.push({ x: nx, y: ny, offset: at });
        else missing.push(index);
      }
    }
    if (!boundary.length) continue;
    for (const index of missing) {
      const x = index % size,
        y = Math.floor(index / size),
        at = offset(x, y);
      let total = 0,
        red = 0,
        green = 0,
        blue = 0;
      for (const sample of boundary) {
        const distanceSquared = (sample.x - x) ** 2 + (sample.y - y) ** 2;
        const weight = 1 / (distanceSquared * distanceSquared);
        total += weight;
        red += pixels[sample.offset] * weight;
        green += pixels[sample.offset + 1] * weight;
        blue += pixels[sample.offset + 2] * weight;
      }
      const alpha = pixels[at + 3] / 255;
      pixels[at] = Math.round(pixels[at] * alpha + (red / total) * (1 - alpha));
      pixels[at + 1] = Math.round(pixels[at + 1] * alpha + (green / total) * (1 - alpha));
      pixels[at + 2] = Math.round(pixels[at + 2] * alpha + (blue / total) * (1 - alpha));
      pixels[at + 3] = 255;
    }
  }
}

/** Replicate the outermost pixels (OpenCV BORDER_REPLICATE semantics).
 * Copying bytes avoids mirror patterns, corner color mismatches and seams
 * between separately scaled strips. The original center is copied unchanged.
 */
export function replicateBorder(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  pad: number,
): Uint8ClampedArray {
  const stride = (width + 2 * pad) * 4;
  const result = new Uint8ClampedArray(stride * (height + 2 * pad));
  for (let y = 0; y < height; y++) {
    const from = y * width * 4,
      row = (y + pad) * stride;
    result.set(source.subarray(from, from + width * 4), row + pad * 4);
    for (let x = 0; x < pad; x++)
      for (let c = 0; c < 4; c++) {
        result[row + x * 4 + c] = source[from + c];
        result[row + (pad + width + x) * 4 + c] = source[from + (width - 1) * 4 + c];
      }
  }
  const top = result.subarray(pad * stride, (pad + 1) * stride);
  const bottom = result.subarray((pad + height - 1) * stride, (pad + height) * stride);
  for (let y = 0; y < pad; y++) {
    result.set(top, y * stride);
    result.set(bottom, (pad + height + y) * stride);
  }
  return result;
}

/** Round only the raster placement to the output pixel grid. Shared tile edges
 * must land on the same pixel boundary, including quarter-turn rotations.
 * Vector cut geometry and registration positions remain in millimeters.
 */
export function drawBleedTile(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  tile: HTMLCanvasElement | OffscreenCanvas,
  width: number,
  height: number,
  bleed: number,
) {
  const m = ctx.getTransform();
  const point = (x: number, y: number) => ({
    x: Math.round(m.a * x + m.c * y + m.e),
    y: Math.round(m.b * x + m.d * y + m.f),
  });
  const origin = point(-bleed, -bleed);
  const right = point(width + bleed, -bleed);
  const bottom = point(-bleed, height + bleed);
  ctx.save();
  ctx.setTransform(
    (right.x - origin.x) / tile.width,
    (right.y - origin.y) / tile.width,
    (bottom.x - origin.x) / tile.height,
    (bottom.y - origin.y) / tile.height,
    origin.x,
    origin.y,
  );
  ctx.drawImage(tile, 0, 0);
  ctx.restore();
}
