import type { StickerArtwork, StickerPose } from './stickers';
import { hasTrimmedOutline, stickerLocalCuts } from './sticker-cuts';
import type { PointMm } from './generated-registration';

type Path = { points: PointMm[]; closed: boolean };
export type Footprint = {
  paths: Path[];
  width: number;
  height: number;
  shaped?: boolean;
  circle?: { x: number; y: number; radius: number };
  ellipse?: { x: number; y: number; a: number; b: number; ux: number; uy: number };
  convex?: PointMm[];
};
export type OccupiedSticker = { pose: StickerPose; footprint: Footprint };

/** Only trimmed artwork can safely share rectangular bounds with another sticker. */
export function stickerFootprint(
  art: StickerArtwork | undefined,
  pose: StickerPose,
  fit: 'contain' | 'cover',
): Footprint {
  const a = (pose.rotation * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  const width = Math.abs(c) * pose.width + Math.abs(s) * pose.height;
  const height = Math.abs(s) * pose.width + Math.abs(c) * pose.height;
  const shaped = hasTrimmedOutline(art?.design);
  const local =
    art?.design && shaped
      ? stickerLocalCuts(art.design, pose, fit, false)
      : [
          {
            closed: true,
            points: [
              { x: 0, y: 0 },
              { x: pose.width, y: 0 },
              { x: pose.width, y: pose.height },
              { x: 0, y: pose.height },
            ],
          },
        ];
  const paths = local.map((path) => ({
    ...path,
    points: path.points.map((p) => {
      const x = p.x - pose.width / 2,
        y = p.y - pose.height / 2;
      return { x: width / 2 + x * c - y * s, y: height / 2 + x * s + y * c };
    }),
  }));
  const cuts = art?.design?.elements.filter((e) => e.operation === 'cut');
  let circle: Footprint['circle'];
  let ellipse: Footprint['ellipse'];
  if (
    art?.design &&
    hasTrimmedOutline(art.design) &&
    cuts?.length === 1 &&
    cuts[0].shape === 'ellipse'
  ) {
    const points = paths[0].points;
    const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    const radii = points.map((p) => Math.hypot(p.x - x, p.y - y));
    const radius = Math.max(...radii);
    const u = { x: points[0].x - x, y: points[0].y - y };
    const v = { x: points[32].x - x, y: points[32].y - y };
    const a = Math.hypot(u.x, u.y),
      b = Math.hypot(v.x, v.y);
    if (Math.abs(u.x * v.x + u.y * v.y) < a * b * 1e-8)
      ellipse = { x, y, a, b, ux: u.x / a, uy: u.y / a };
    if (radius - Math.min(...radii) < 1e-6) circle = { x, y, radius };
  }
  let convex: PointMm[] | undefined;
  if (paths.length === 1 && paths[0].closed) {
    const points = paths[0].points;
    let positive = false,
      negative = false;
    for (let i = 0; i < points.length; i++) {
      const turn = cross(
        points[i],
        points[(i + 1) % points.length],
        points[(i + 2) % points.length],
      );
      if (turn > 1e-8) positive = true;
      if (turn < -1e-8) negative = true;
    }
    if (positive !== negative) convex = points;
  }
  return { width, height, paths, circle, ellipse, shaped, convex };
}
/** Homothetic ellipses have an exact elliptical Minkowski sum. */
function ellipsePair(a: Footprint, b: Footprint) {
  const p = a.ellipse,
    q = b.ellipse;
  if (
    !p ||
    !q ||
    Math.abs(p.ux * q.uy - p.uy * q.ux) > 1e-8 ||
    Math.abs(p.a / p.b - q.a / q.b) > 1e-8
  )
    return;
  return { a: p.a + q.a, b: p.b + q.b, ux: p.ux, uy: p.uy, p, q };
}
function pointEllipseDistance(x: number, y: number, a: number, b: number) {
  x = Math.abs(x);
  y = Math.abs(y);
  const aa = a * a,
    bb = b * b;
  let low = 0,
    high = Math.max(aa, bb, a * x + b * y);
  for (let i = 0; i < 42; i++) {
    const t = (low + high) / 2;
    if (((a * x) / (t + aa)) ** 2 + ((b * y) / (t + bb)) ** 2 > 1) low = t;
    else high = t;
  }
  // The lower root bound stays conservative for minimum clearance.
  return Math.hypot(x - (aa * x) / (low + aa), y - (bb * y) / (low + bb));
}
const cross = (a: PointMm, b: PointMm, p: PointMm) =>
  (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
function pointSegment(p: PointMm, a: PointMm, b: PointMm) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function inside(p: PointMm, points: PointMm[]) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      result = !result;
  }
  return result;
}
/** GJK distance bounds for convex outlines. Ambiguous contacts use the exact segment test. */
function convexConflict(
  a: PointMm[],
  b: PointMm[],
  dx: number,
  dy: number,
  gap: number,
): boolean | undefined {
  let simplex = [{ x: a[0].x - b[0].x - dx, y: a[0].y - b[0].y - dy }];
  let closest = simplex[0];
  const origin = { x: 0, y: 0 },
    threshold = Math.max(0, gap - 1e-7);
  for (let iteration = 0; iteration < 32; iteration++) {
    const length = Math.hypot(closest.x, closest.y);
    if (length < Math.max(threshold, 1e-9)) return true;
    const p = a.reduce((best, p) =>
      p.x * closest.x + p.y * closest.y < best.x * closest.x + best.y * closest.y ? p : best,
    );
    const q = b.reduce((best, p) =>
      p.x * closest.x + p.y * closest.y > best.x * closest.x + best.y * closest.y ? p : best,
    );
    const support = { x: p.x - q.x - dx, y: p.y - q.y - dy };
    if ((closest.x * support.x + closest.y * support.y) / length >= Math.max(threshold, 1e-9))
      return false;
    simplex.push(support);
    if (simplex.length === 3) {
      const [u, v, w] = simplex;
      const signs = [cross(u, v, origin), cross(v, w, origin), cross(w, u, origin)];
      if (
        Math.abs(cross(u, v, w)) > 1e-12 &&
        (signs.every((n) => n >= 0) || signs.every((n) => n <= 0))
      )
        return true;
    }
    let bestDistance = Infinity,
      next: PointMm[] = [],
      nextClosest = closest;
    for (let i = 0; i < simplex.length - 1; i++)
      for (let j = i + 1; j < simplex.length; j++) {
        const u = simplex[i],
          v = simplex[j],
          x = v.x - u.x,
          y = v.y - u.y;
        const t = Math.max(0, Math.min(1, -(u.x * x + u.y * y) / (x * x + y * y || 1)));
        const point = { x: u.x + t * x, y: u.y + t * y },
          distance = point.x * point.x + point.y * point.y;
        if (distance < bestDistance) {
          bestDistance = distance;
          next = t === 0 ? [u] : t === 1 ? [v] : [u, v];
          nextClosest = point;
        }
      }
    if (Math.hypot(closest.x - nextClosest.x, closest.y - nextClosest.y) < 1e-12) return;
    simplex = next;
    closest = nextClosest;
  }
}
/** Filled closed contours plus open blade paths, with the requested edge-to-edge clearance. */
export function footprintsConflict(
  a: Footprint,
  ax: number,
  ay: number,
  b: Footprint,
  bx: number,
  by: number,
  gap = 0,
): boolean {
  if (
    ax + a.width + gap <= bx + 1e-7 ||
    bx + b.width + gap <= ax + 1e-7 ||
    ay + a.height + gap <= by + 1e-7 ||
    by + b.height + gap <= ay + 1e-7
  )
    return false;
  if (a.circle && b.circle)
    return (
      Math.hypot(ax + a.circle.x - bx - b.circle.x, ay + a.circle.y - by - b.circle.y) <
      a.circle.radius + b.circle.radius + gap - 1e-7
    );
  const pair = ellipsePair(a, b);
  if (pair) {
    const dx = bx + pair.q.x - ax - pair.p.x,
      dy = by + pair.q.y - ay - pair.p.y;
    const x = dx * pair.ux + dy * pair.uy,
      y = -dx * pair.uy + dy * pair.ux;
    const normalized = Math.hypot(x / pair.a, y / pair.b);
    if (normalized < 1 - 1e-9) return true;
    if (gap <= 0) return false;
    if ((normalized - 1) * Math.min(pair.a, pair.b) >= gap) return false;
    return pointEllipseDistance(x, y, pair.a, pair.b) < gap - 1e-7;
  }
  const dx = bx - ax,
    dy = by - ay;
  if (a.convex && b.convex) {
    const conflict = convexConflict(a.convex, b.convex, dx, dy, gap);
    if (conflict !== undefined) return conflict;
  }
  for (const ap of a.paths)
    for (const raw of b.paths) {
      const bp = raw.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      if (
        (ap.closed && bp.some((p) => inside(p, ap.points))) ||
        (raw.closed && ap.points.some((p) => inside(p, bp)))
      )
        return true;
      for (let i = 0; i < ap.points.length - (ap.closed ? 0 : 1); i++) {
        const u = ap.points[i],
          v = ap.points[(i + 1) % ap.points.length];
        for (let j = 0; j < bp.length - (raw.closed ? 0 : 1); j++) {
          const w = bp[j],
            z = bp[(j + 1) % bp.length];
          if (
            Math.max(u.x, v.x) + gap < Math.min(w.x, z.x) ||
            Math.max(w.x, z.x) + gap < Math.min(u.x, v.x) ||
            Math.max(u.y, v.y) + gap < Math.min(w.y, z.y) ||
            Math.max(w.y, z.y) + gap < Math.min(u.y, v.y)
          )
            continue;
          if (cross(u, v, w) * cross(u, v, z) < 0 && cross(w, z, u) * cross(w, z, v) < 0)
            return true;
          const distance = Math.min(
            pointSegment(u, w, z),
            pointSegment(v, w, z),
            pointSegment(w, u, v),
            pointSegment(z, u, v),
          );
          if (distance < Math.max(gap - 1e-7, 1e-8)) return true;
        }
      }
    }
  return false;
}

/** Contact candidates allow staggered circles and non-rectangular silhouettes to share bounds. */
export function nestingCandidates(
  shape: Footprint,
  occupied: OccupiedSticker[],
  gap: number,
): PointMm[] {
  const candidates: PointMm[] = [];
  for (const { pose, footprint: other } of occupied) {
    if (!shape.shaped && !other.shaped) continue;
    const pair = ellipsePair(shape, other);
    if (pair && !(shape.circle && other.circle)) {
      for (let n = 0; n < 24; n++) {
        const angle = (n * Math.PI) / 12,
          nx = Math.cos(angle),
          ny = Math.sin(angle);
        const denominator = Math.hypot(pair.a * nx, pair.b * ny);
        const x = (pair.a * pair.a * nx) / denominator + gap * nx;
        const y = (pair.b * pair.b * ny) / denominator + gap * ny;
        candidates.push({
          x: pose.x + pair.q.x - pair.p.x + x * pair.ux - y * pair.uy,
          y: pose.y + pair.q.y - pair.p.y + x * pair.uy + y * pair.ux,
        });
      }
    } else if (shape.circle && other.circle) {
      const r = shape.circle.radius + other.circle.radius + gap;
      for (let n = 0; n < 24; n++) {
        const angle = (n * Math.PI) / 12;
        candidates.push({
          x: pose.x + other.circle.x + r * Math.cos(angle) - shape.circle.x,
          y: pose.y + other.circle.y + r * Math.sin(angle) - shape.circle.y,
        });
      }
    } else if (shape.convex && other.convex) {
      // Support contacts cover convex outlines without a quadratic vertex-pair expansion.
      for (let n = 0; n < 24; n++) {
        const angle = (n * Math.PI) / 12,
          nx = Math.cos(angle),
          ny = Math.sin(angle);
        const support = (points: PointMm[], direction: number) =>
          points.reduce((best, p) =>
            direction * (p.x * nx + p.y * ny) > direction * (best.x * nx + best.y * ny) ? p : best,
          );
        const p = support(shape.convex, -1),
          q = support(other.convex, 1);
        candidates.push({ x: pose.x + q.x - p.x + gap * nx, y: pose.y + q.y - p.y + gap * ny });
      }
    } else {
      // Edge/vertex contact samples for mixed, concave, and polygonal designs.
      const sample = (paths: Path[]) => {
        const points = paths.flatMap((p) => p.points);
        return points.filter((_, i) => i % Math.max(1, Math.ceil(points.length / 16)) === 0);
      };
      const from = sample(shape.paths),
        to = sample(other.paths);
      for (const p of from)
        for (const q of to) {
          for (const [dx, dy] of [
            [gap, 0],
            [-gap, 0],
            [0, gap],
            [0, -gap],
          ])
            candidates.push({ x: pose.x + q.x - p.x + dx, y: pose.y + q.y - p.y + dy });
        }
    }
  }
  return candidates;
}
