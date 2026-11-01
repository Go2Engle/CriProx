// Independently implemented subset of the DeviceIO protobuf wire contract.
// Field numbers observed in Design Space 43.2.0; see docs/EXPLORE-5-INTEGRATION.md.
const MAX_FRAME_BYTES = 1024 * 1024;

function uint(value) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
    throw new Error('Expected a uint32');
  const result = [];
  do {
    const low = value % 128;
    value = Math.floor(value / 128);
    result.push(low | (value ? 128 : 0));
  } while (value);
  return Buffer.from(result);
}

function message(number, bytes = Buffer.alloc(0)) {
  return Buffer.concat([uint(number * 8 + 2), uint(bytes.length), bytes]);
}

function scalar(number, value) {
  return Buffer.concat([uint(number * 8), uint(value)]);
}

function fields(bytes) {
  const result = [];
  let offset = 0;
  function varint() {
    let value = 0n;
    for (let index = 0; index < 10; index++) {
      if (offset >= bytes.length) throw new Error('Truncated protobuf varint');
      const byte = bytes[offset++];
      if (index === 9 && byte > 1) throw new Error('Oversized protobuf varint');
      value |= BigInt(byte & 127) << BigInt(7 * index);
      if (!(byte & 128)) return value;
    }
    throw new Error('Oversized protobuf varint');
  }
  while (offset < bytes.length) {
    const tag = varint();
    if (tag > 0xffffffffn || tag < 8n) throw new Error('Invalid protobuf tag');
    const number = Number(tag >> 3n),
      wire = Number(tag & 7n);
    if (wire === 0) {
      const value = varint();
      result.push({
        number,
        wire,
        value: value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value,
      });
    } else if (wire === 1 || wire === 2 || wire === 5) {
      const length = wire === 2 ? varint() : BigInt(wire === 1 ? 8 : 4);
      if (length > BigInt(bytes.length - offset)) throw new Error('Truncated protobuf field');
      const end = offset + Number(length);
      result.push({ number, wire, value: bytes.subarray(offset, end) });
      offset = end;
    } else {
      throw new Error('Unsupported protobuf wire type');
    }
  }
  return result;
}

function one(list, number, wire) {
  const matches = list.filter((field) => field.number === number);
  if (matches.length > 1 || (matches[0] && matches[0].wire !== wire))
    throw new Error('Invalid protobuf response field');
  return matches[0]?.value;
}

function frame(bytes) {
  if (!bytes.length || bytes.length > MAX_FRAME_BYTES)
    throw new Error('Invalid DeviceIO frame size');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(bytes.length);
  return Buffer.concat([header, bytes]);
}

class FrameReader {
  constructor(onFrame) {
    this.onFrame = onFrame;
    this.pending = Buffer.alloc(0);
  }
  push(chunk) {
    // Consume a large chunk incrementally; never allocate from an unchecked peer length.
    let offset = 0;
    while (offset < chunk.length) {
      const needed = this.pending.length < 4 ? 4 : 4 + this.pending.readUInt32LE(0);
      const take = Math.min(needed - this.pending.length, chunk.length - offset);
      this.pending = Buffer.concat([this.pending, chunk.subarray(offset, offset + take)]);
      offset += take;
      if (this.pending.length < 4) continue;
      const length = this.pending.readUInt32LE(0);
      if (!length || length > MAX_FRAME_BYTES) throw new Error('Invalid DeviceIO frame size');
      if (this.pending.length === 4 + length) {
        const body = this.pending.subarray(4);
        this.pending = Buffer.alloc(0);
        this.onFrame(body);
      }
    }
  }
}

module.exports = { MAX_FRAME_BYTES, uint, scalar, message, fields, one, frame, FrameReader };
