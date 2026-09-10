import type { Settings } from './types';

export type Units = Settings['units'];

export function lengthValue(mm: number, units: Units): number {
  return units === 'in' ? mm / 25.4 : mm;
}

export function formatLength(mm: number, units: Units, precision?: number): string {
  const value = lengthValue(mm, units);
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: precision ?? (units === 'in' ? 4 : 2),
    minimumFractionDigits: 0,
    useGrouping: false,
  }).format(value);
}

export function formatMeasurement(mm: number, units: Units, precision?: number): string {
  return `${formatLength(mm, units, precision)} ${units}`;
}

export function formatDimensions(
  widthMm: number,
  heightMm: number,
  units: Units,
  precision?: number,
): string {
  return `${formatLength(widthMm, units, precision)} × ${formatLength(heightMm, units, precision)} ${units}`;
}
