// Experimental native transport owned exclusively by the isolated cutter worker.
const { DiscoverySession } = require('./discovery.cjs');
const { fields, one, message, scalar } = require('./wire.cjs');

class DeviceSession extends DiscoverySession {
  receive(body) {
    const outer = one(fields(body), 3, 2);
    if (outer) {
      const adapter = fields(outer);
      const descriptor = one(adapter, 1, 2);
      if (descriptor && one(fields(descriptor), 1, 0) === this.adapterId) {
        const transportBytes = one(adapter, 100, 2);
        if (transportBytes) {
          const transport = fields(transportBytes),
            identity = one(transport, 1, 2);
          if (identity && one(fields(identity), 1, 0) === this.transportId) {
            const data = one(transport, 21, 2);
            if (data) {
              const notification = fields(data);
              if (one(notification, 2, 0) === 1) {
                const bytes = one(notification, 1, 2);
                if (bytes) this.onBytes?.(bytes);
              } else this.onTransportError?.(new Error('Device receive failed'));
            }
            const state = one(transport, 18, 2);
            if (state) this.onState?.(one(fields(state), 1, 0));
            if (this.transportResponse !== undefined && this.pending) {
              const response = one(transport, this.transportResponse, 2);
              if (!response) return;
              const decoded = fields(response),
                pending = this.pending;
              clearTimeout(pending.timer);
              this.pending = null;
              this.transportResponse = undefined;
              pending.resolve(decoded);
              return;
            }
          }
          // Never let another transport/notification complete a transport request.
          if (this.transportResponse !== undefined) return;
        }
      }
    }
    super.receive(body);
  }
  async createTransport(device, { tx, rx, forceUnpaired = false }) {
    const uuid = (value) => {
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))
        throw new Error('Invalid characteristic UUID');
      return Buffer.from(value.replaceAll('-', ''), 'hex');
    };
    const params = Buffer.concat([
      scalar(1, device.deviceIdHigh),
      scalar(2, device.deviceIdLow),
      message(3, uuid(tx)),
      message(4, uuid(rx)),
      scalar(5, 8000),
      scalar(6, 6),
      scalar(7, 10),
      scalar(8, forceUnpaired ? 1 : 0),
      scalar(9, 1),
    ]);
    await this.createNativeTransport(33, params);
  }
  async createUsbTransport(device) {
    // Matches Design Space's USB defaults: interface 0, composite device.
    const params = Buffer.concat([
      message(1, Buffer.from(device.serialNumber || '', 'utf8')),
      scalar(2, device.vendorId),
      scalar(3, device.productId),
      scalar(4, 0),
      scalar(5, 1),
    ]);
    await this.createNativeTransport(53, params);
  }
  async createNativeTransport(request, params) {
    if (!this.adapters.has(this.adapterId)) throw new Error('Unknown DeviceIO adapter');
    if (this.transportId !== undefined) throw new Error('Transport already created');
    const response = await this.request(
      message(
        3,
        Buffer.concat([
          message(1, scalar(1, this.adapterId)),
          message(request, message(1, params)),
        ]),
      ),
      3,
      this.adapterId,
      request + 1,
    );
    const error = one(response, 2, 2);
    if (error)
      throw new Error(one(fields(error), 1, 2)?.toString() || 'Device transport creation failed');
    const transport = one(response, 1, 2);
    const id = transport && one(fields(transport), 1, 0);
    if (!Number.isInteger(id)) throw new Error('Missing transport ID');
    this.transportId = id;
  }
  async operation(request, response, payload = Buffer.alloc(0)) {
    if (this.pending) throw new Error('DeviceIO operation already in progress');
    this.transportResponse = response;
    try {
      const result = await this.request(
        message(
          3,
          Buffer.concat([
            message(1, scalar(1, this.adapterId)),
            message(
              100,
              Buffer.concat([message(1, scalar(1, this.transportId)), message(request, payload)]),
            ),
          ]),
        ),
        3,
        this.adapterId,
        100,
      );
      if (request !== 10 && one(result, 1, 0) !== 1) {
        const error = one(result, 2, 2);
        throw new Error(error ? one(fields(error), 1, 2)?.toString() : 'Device operation failed');
      }
      return result;
    } finally {
      this.transportResponse = undefined;
    }
  }
  send(bytes) {
    // Keep native writes serialized while Bifrost routes device responses itself.
    const send = () => this.operation(19, 20, message(1, Buffer.from(bytes)));
    this.sendQueue = (this.sendQueue || Promise.resolve()).then(send);
    return this.sendQueue;
  }
}

module.exports = { DeviceSession };
