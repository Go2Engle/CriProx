export type CutterState = {
  status:
    'disconnected' | 'connecting' | 'connected' | 'homing' | 'cutting' | 'disconnecting' | 'error';
  encrypted: boolean;
  supported: boolean;
  message: string;
  transport?: 'usb' | 'ble';
  name?: string;
  firmware?: string;
  carriage?: string;
  queuedMoves?: number;
  phase?: 'working' | 'scanning' | 'cutting' | 'paused';
  cutSettings?: {
    material: string;
    materialName: string;
    preset: string;
    pressureGrams: number;
    passes: number;
  };
  capabilities: {
    connect: boolean;
    home: boolean;
    registrationScan: boolean;
    cut: boolean;
    pause: boolean;
    cancel: boolean;
    pressureTest: boolean;
  };
};
export const DISCONNECTED_CUTTER: CutterState = {
  status: 'disconnected',
  encrypted: false,
  supported: false,
  message: 'Open the Windows desktop app to connect a cutter.',
  capabilities: {
    connect: false,
    home: false,
    registrationScan: false,
    cut: false,
    pause: false,
    cancel: false,
    pressureTest: false,
  },
};
