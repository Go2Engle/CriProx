// Default: offline engine contract probe. --usb / --bluetooth add discovery only.
const { loadInstalledRuntime } = require('./lib/cricut-runtime.cjs');
const { discoverCricutDevices } = require('../electron/cutter/discovery.cjs');

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => !['--usb', '--bluetooth'].includes(arg)))
    throw new Error('Usage: npm run cutter:probe -- [--usb] [--bluetooth]');
  const { installation, api } = await loadInstalledRuntime();
  const { Bifrost: B, Runtime: R } = api;
  const methods = (type) =>
    Object.getOwnPropertyNames(type.prototype).filter(
      (name) => !['constructor', 'toString'].includes(name),
    );
  const report = {
    designSpaceVersion: installation.version,
    runtimeVersion: B.BifrostInfo.version,
    mode: 'offline engine with in-memory transport',
    model: {
      name: 'Cricut Explore 5',
      runtimeType: 'gandalf',
      machineTypeId: 24,
      serialPrefix: B.DeviceType.getSerialNumberPrefix('gandalf'),
    },
    bluetoothCharacteristics: {
      rx: B.DeviceType.getBluetoothLowEnergyRxUUID('gandalf'),
      tx: B.DeviceType.getBluetoothLowEnergyTxUUID('gandalf'),
    },
    jobMethods: methods(B.PressureMachinesPlotJob),
    scanMethods: methods(B.PrintThenCutSkillImpl),
    jobEvents: Object.getOwnPropertyNames(B.PressureMachinesPlotJobEvent).filter((name) =>
      /^[A-Z]/.test(name),
    ),
    writes: [],
    hardwareCutVerified: false,
  };
  const connection = B.GenericPhysicalConnection.create(
    async () => R.Result.success(undefined),
    async () => R.Result.success(undefined),
    async (bytes) => {
      report.writes.push(Buffer.from(bytes).toString('hex'));
      return R.Result.success(bytes.byteLength);
    },
    { connectionParameters: new B.ConnectionParameters(150, 0) },
  );
  await connection.connect();
  try {
    const device = B.GandalfDevice.createDevice(connection);
    try {
      await device.deviceInformationSkill.getVersion();
      throw new Error('The offline transport unexpectedly supplied a device response');
    } catch (error) {
      if (!/timed out/i.test(String(error))) throw error;
      report.offlineRequestResult = 'timed out as expected; no simulated device response';
    }
    report.offlineConnectionEncrypted = await device.handshakeSkill.isConnectionEncrypted();
  } finally {
    await connection.disconnect();
  }

  if (args.size) {
    const discovery = await discoverCricutDevices({
      installation,
      bluetooth: args.has('--bluetooth'),
    });
    // Native enumeration includes unrelated peripherals. Output counts and classified cutter types only.
    const usbTypes = discovery.usb.flatMap((device) => {
      try {
        const type = B.DeviceType.fromUsbSerialDescriptor({
          vid: device.vendorId,
          pid: device.productId,
          serialNumber: device.serialNumber,
        });
        return type ? [type] : [];
      } catch {
        return [];
      }
    });
    const bluetoothTypes = discovery.bluetooth?.devices.flatMap((device) => {
      try {
        const bytes = device.manufacturerData;
        const type = B.DeviceType.fromBluetoothLeDescriptor({
          localName: device.localName,
          manufacturerData: bytes.length
            ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
            : undefined,
        });
        return type ? [type] : [];
      } catch {
        return [];
      }
    });
    report.discovery = {
      bridgeResponded: discovery.bridgeResponded,
      usbDescriptors: discovery.usb.length,
      usbCutterTypes: usbTypes,
      bluetoothReady: discovery.bluetooth?.ready ?? null,
      bluetoothDescriptors: discovery.bluetooth?.devices.length ?? null,
      bluetoothCutterTypes: bluetoothTypes ?? null,
      deviceConnectionsAttempted: 0,
    };
  }
  return report;
}

const deadline = setTimeout(() => {
  console.error('Cutter probe exceeded its 20-second deadline');
  process.exit(1);
}, 20000);
// Keep the runtime's ordinary log chatter off the JSON report.
const originalLog = console.log;
console.log = () => {};
main()
  .then(
    (report) => {
      console.log = originalLog;
      console.log(JSON.stringify(report, null, 2));
    },
    (error) => {
      console.error(error.message);
      process.exitCode = 1;
    },
  )
  .finally(() => {
    console.log = originalLog;
    clearTimeout(deadline);
  });
