export type RectMm = { x: number; y: number; width: number; height: number };
export type PointMm = { x: number; y: number };
export type CutShape = RectMm & { rotation: number; radius: number; itemId: string };
export const MM_PER_PT: number;
export const REGISTRATION_METRICS: {
  arm: number;
  thickness: number;
  edgeInset: number;
  clearance: number;
  printBleed: number;
};
export function registrationGeometry(
  machine: string,
  paper: string,
): {
  page: { width: number; height: number };
  frame: RectMm;
  marks: PointMm[][];
  keepOuts: RectMm[];
  source: string;
  placement: string;
};
export function registrationOrigin(paper: string, area: { width: number; height: number }): PointMm;
export function polygonPath(points: PointMm[]): string;
export function shapePolygon(shape: CutShape, bleed?: number): PointMm[];
export function registrationConflicts(
  shapes: CutShape[],
  geometry: ReturnType<typeof registrationGeometry>,
  bleed?: number,
): { blocked: string[]; clearance: string[] };
