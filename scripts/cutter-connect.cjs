const path = require('node:path');
const { loadInstalledRuntime } = require('./lib/cricut-runtime.cjs');
const { DeviceSession } = require('./lib/cricut-device-session.cjs');
const { fields, one, scalar } = require('../electron/cutter/wire.cjs');

async function main({ keyProvider, onAuthenticated } = {}) {
  if (process.argv.slice(2).some((arg) => arg !== '--usb'))
    throw new Error('Usage: node scripts/cutter-connect.cjs [--usb]');
  const usb = process.argv.includes('--usb');
  const {
    installation,
    api: { Bifrost: B, Runtime: R },
  } = await loadInstalledRuntime();
  const config = B.ConnectionConfig.create(
    usb ? 'usbSerial' : 'bluetoothLowEnergySerial',
    'gandalf',
  );
  const session = new DeviceSession(
    path.join(
      path.dirname(installation.executable),
      'resources/plugins/cricut-device-io/CricutDeviceIO.exe',
    ),
    { timeoutMs: 12000 },
  );
  let connection;
  const report = {
    mode: `${usb ? 'USB' : 'BLE'} ${keyProvider ? 'authenticated research session' : 'read-only device probe'}`,
    runtimeVersion: B.BifrostInfo.version,
    connected: false,
    encrypted: false,
    device: null,
  };
  try {
    let devices;
    if (usb) {
      devices = (await session.enumerateUsb()).flatMap((device) => {
        try {
          const type = B.DeviceType.fromUsbSerialDescriptor({
            vid: device.vendorId,
            pid: device.productId,
            serialNumber: device.serialNumber,
          });
          return type === 'gandalf' ? [{ ...device, name: 'Explore 5 USB', type }] : [];
        } catch {
          return [];
        }
      });
      session.adapterId = [...session.adapters][0];
    } else {
      session.adapterId = await session.create('ble');
      if (one(await session.adapterRequest(session.adapterId, 35, 36), 1, 0) !== 1)
        throw new Error('Bluetooth is not ready');
      const scan = await session.adapterRequest(session.adapterId, 12, 13);
      if (one(scan, 1, 2)) throw new Error('Bluetooth scan failed');
      await new Promise((resolve) => setTimeout(resolve, 5000));
      // Read while scanning: native caches may be cleared when scanning is stopped.
      const list = await session.adapterRequest(session.adapterId, 31, 32);
      await session.adapterRequest(session.adapterId, 14, 15);
      devices = list
        .filter((f) => f.number === 1)
        .flatMap((f) => {
          const data = fields(f.value),
            name = one(data, 3, 2)?.toString() || '';
          const bytes = one(data, 4, 2);
          try {
            const type = B.DeviceType.fromBluetoothLeDescriptor({
              localName: name,
              manufacturerData: bytes?.buffer.slice(
                bytes.byteOffset,
                bytes.byteOffset + bytes.byteLength,
              ),
            });
            return type === 'gandalf'
              ? [{ name, type, deviceIdHigh: one(data, 1, 0), deviceIdLow: one(data, 2, 0) }]
              : [];
          } catch {
            return [];
          }
        });
    }
    if (devices.length !== 1) throw new Error(`Expected one Explore 5; found ${devices.length}`);
    const target = devices[0];
    report.device = { name: target.name, type: target.type };
    console.error('Found', JSON.stringify(report.device));
    if (usb) await session.createUsbTransport(target);
    else
      await session.createTransport(target, {
        tx: B.DeviceType.getBluetoothLowEnergyTxUUID('gandalf'),
        rx: B.DeviceType.getBluetoothLowEnergyRxUUID('gandalf'),
      });
    connection = B.GenericPhysicalConnection.create(
      async () => {
        try {
          await session.operation(12, 13, scalar(1, 8000));
          return R.Result.success();
        } catch (error) {
          report.connectError = error.message;
          return R.Result.failure('operationFailed');
        }
      },
      async () => {
        try {
          await session.operation(14, 15);
          return R.Result.success();
        } catch {
          return R.Result.failure('operationFailed');
        }
      },
      async (bytes) => {
        try {
          await session.send(bytes);
          return R.Result.success(bytes.byteLength);
        } catch {
          return R.Result.failure('operationFailed');
        }
      },
      { connectionParameters: config.connectionParams },
    );
    session.onBytes = (bytes) =>
      connection.onDataReceived(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      );
    session.onState = (state) => {
      if (state === 0) connection.onDisconnected();
    };
    await connection.connect();
    if (report.connectError) throw new Error(report.connectError);
    report.connected = true;
    const device = B.GandalfDevice.createDevice(connection);
    if (keyProvider) {
      let key = await keyProvider();
      if (typeof key !== 'string' || !key.length || key.length > 16384)
        throw new Error('Key provider did not return a valid handshake input');
      // Account/session access belongs to an explicitly authorized external provider,
      // never to the packaged app or this default read-only probe.
      const previousError = console.error;
      console.error = (...args) =>
        previousError(
          ...args.map((value) =>
            typeof value === 'string' ? value.replaceAll(key, '[redacted]') : value,
          ),
        );
      try {
        await device.handshakeSkill.establishEncryption(key);
        report.handshakeCompleted = true;
      } catch {
        report.handshakeCompleted = false;
        throw new Error('Machine encryption handshake failed');
      } finally {
        console.error = previousError;
        key = undefined;
      }
    }
    for (const [name, read] of [
      ['firmware', () => device.deviceInformationSkill.getVersion()],
      ['encrypted', () => device.handshakeSkill.isConnectionEncrypted()],
    ]) {
      try {
        report[name] = await read();
      } catch (error) {
        report[name + 'Error'] = String(error);
      }
    }
    if (onAuthenticated) {
      if (!report.handshakeCompleted || report.encrypted !== true || report.firmwareError)
        throw new Error('Authenticated device verification required');
      report.sessionResult = await onAuthenticated(device, B);
    }
  } catch (error) {
    report.error = String(error);
    process.exitCode = 1;
  } finally {
    try {
      await session.sendQueue;
    } catch {}
    if (connection) {
      try {
        await connection.disconnect();
      } catch {}
    }
    if (session.transportId !== undefined && !session.failure) {
      try {
        await session.operation(10, 11);
      } catch {}
    }
    await session.close();
  }
  if (report.firmwareError || report.encryptedError) process.exitCode = 1;
  output(JSON.stringify(report, null, 2) + '\n');
}
// Keep installed runtime diagnostics out of the JSON result.
console.log = (...args) => console.error(...args);
const output = process.stdout.write.bind(process.stdout);
module.exports = { main };
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
