export type CardFace = { name: string; image: string; preview: string };
export const PRINT_DPI_OPTIONS = [300, 600, 900, 1200] as const;
export type PrintDpi = (typeof PRINT_DPI_OPTIONS)[number];
export type Card = {
  id: string;
  name: string;
  set: string;
  setName: string;
  collector: string;
  faces: CardFace[];
  oracleId?: string;
  demo?: boolean;
};
export type Entry = { id: string; card: Card; quantity: number; face: number };
export type Settings = {
  units: 'mm' | 'in';
  paper: 'letter' | 'a4';
  machine: 'maker' | 'explore' | 'joy-xtra';
  profile: 'conservative' | 'expanded';
  width: number;
  height: number;
  gap: number;
  radius: number;
  bleed: number;
  backBleedEnabled: boolean;
  backsEnabled: boolean;
  backPrintMode: 'manual' | 'duplex';
  backFlip: 'long-edge' | 'short-edge';
  backRotation: 0 | 180;
  backOffsetX: number;
  backOffsetY: number;
  dpi: PrintDpi;
  proxyLabel: boolean;
};
export type Project = {
  version: 1;
  name: string;
  entries: Entry[];
  settings: Settings;
  backArtwork?: CardFace;
};
export const DEFAULT_SETTINGS: Settings = {
  units: 'in',
  paper: 'letter',
  machine: 'maker',
  profile: 'expanded',
  width: 63,
  height: 88,
  gap: 1,
  radius: 3,
  bleed: 0.5,
  backBleedEnabled: true,
  backsEnabled: false,
  backPrintMode: 'manual',
  backFlip: 'long-edge',
  backRotation: 180,
  backOffsetX: 0,
  backOffsetY: 0,
  dpi: 300,
  proxyLabel: true,
};
export const EMPTY_PROJECT: Project = {
  version: 1,
  name: 'Untitled deck',
  entries: [],
  settings: DEFAULT_SETTINGS,
};
