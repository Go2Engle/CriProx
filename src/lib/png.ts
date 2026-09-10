// Set physical pixel density without changing any image pixels.
export function withDpi(png: Uint8Array, dpi: number): Uint8Array {
  const data = new Uint8Array(9),
    view = new DataView(data.buffer);
  view.setUint32(0, Math.round(dpi / 0.0254));
  view.setUint32(4, Math.round(dpi / 0.0254));
  data[8] = 1;
  const chunk = new Uint8Array(21),
    cv = new DataView(chunk.buffer);
  cv.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4);
  chunk.set(data, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.slice(4, 17)) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  cv.setUint32(17, (crc ^ 0xffffffff) >>> 0);
  const parts = [png.slice(0, 8), chunk];
  const input = new DataView(png.buffer, png.byteOffset, png.byteLength);
  for (let offset = 8; offset < png.length;) {
    const length = input.getUint32(offset),
      size = length + 12;
    if (offset + size > png.length) throw new Error('Invalid PNG chunk.');
    const type = new TextDecoder().decode(png.slice(offset + 4, offset + 8));
    if (type !== 'pHYs') parts.push(png.slice(offset, offset + size));
    offset += size;
  }
  // PNG requires IHDR first; put pHYs directly after IHDR.
  [parts[1], parts[2]] = [parts[2], parts[1]];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
