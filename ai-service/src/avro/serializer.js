/**
 * Pure Apache Avro Binary Serializer & Deserializer
 * 
 * Implements Apache Avro 1.11+ Binary Framing Specification:
 * - Zigzag variable-length integer encoding (int & long)
 * - IEEE 754 Little-Endian floating point (float & double)
 * - Byte buffer and UTF-8 string encoding
 * - Complex types: Records, Maps, Arrays, Enums, Unions
 * - Single Object Encoding (RFC header 0xC3 0x01 + 64-bit fingerprint)
 */

class AvroSerializer {
  /**
   * Zigzag encode a 64-bit integer
   * Formula: (n << 1) ^ (n >> 63)
   */
  static writeZigzagVarint(value) {
    let v = BigInt(value);
    v = (v << 1n) ^ (v >> 63n);
    const bytes = [];
    while (v >= 0x80n) {
      bytes.push(Number((v & 0x7Fn) | 0x80n));
      v >>= 7n;
    }
    bytes.push(Number(v & 0x7Fn));
    return Buffer.from(bytes);
  }

  /**
   * Zigzag decode a variable-length integer from buffer
   */
  static readZigzagVarint(buffer, offset = 0) {
    let result = 0n;
    let shift = 0n;
    let cursor = offset;
    while (cursor < buffer.length) {
      const b = BigInt(buffer[cursor++]);
      result |= (b & 0x7Fn) << shift;
      shift += 7n;
      if ((b & 0x80n) === 0n) break;
    }
    const unzigzag = (result >> 1n) ^ (-(result & 1n));
    return { value: Number(unzigzag), bigIntValue: unzigzag, nextOffset: cursor };
  }

  /**
   * Encodes a value against an Avro schema definition into pure binary buffer
   */
  static encode(schema, value) {
    const buffers = [];
    this._encodeValue(schema, value, buffers);
    return Buffer.concat(buffers);
  }

  /**
   * Internal recursive encoder
   */
  static _encodeValue(schema, value, buffers) {
    // 1. Primitive Schema as String (e.g. "string", "int", "long", "boolean", "float", "double", "bytes", "null")
    if (typeof schema === 'string') {
      switch (schema) {
        case 'null':
          // 0 bytes
          return;
        case 'boolean': {
          const b = Buffer.alloc(1);
          b[0] = value ? 1 : 0;
          buffers.push(b);
          return;
        }
        case 'int':
        case 'long': {
          buffers.push(this.writeZigzagVarint(value ?? 0));
          return;
        }
        case 'float': {
          const b = Buffer.alloc(4);
          b.writeFloatLE(Number(value) || 0, 0);
          buffers.push(b);
          return;
        }
        case 'double': {
          const b = Buffer.alloc(8);
          b.writeDoubleLE(Number(value) || 0, 0);
          buffers.push(b);
          return;
        }
        case 'bytes': {
          let buf;
          if (Buffer.isBuffer(value)) {
            buf = value;
          } else if (Array.isArray(value)) {
            buf = Buffer.from(value);
          } else if (typeof value === 'string') {
            buf = Buffer.from(value, 'base64');
          } else {
            buf = Buffer.alloc(0);
          }
          buffers.push(this.writeZigzagVarint(buf.length));
          buffers.push(buf);
          return;
        }
        case 'string': {
          const str = String(value !== undefined && value !== null ? value : '');
          const strBuf = Buffer.from(str, 'utf8');
          buffers.push(this.writeZigzagVarint(strBuf.length));
          buffers.push(strBuf);
          return;
        }
        default:
          throw new Error(`Unsupported primitive schema type: "${schema}"`);
      }
    }

    // 2. Unions: array of schema choices (e.g., ["null", "string"])
    if (Array.isArray(schema)) {
      if (value === null || value === undefined) {
        const nullIdx = schema.indexOf('null');
        if (nullIdx === -1) {
          throw new Error(`Value is null/undefined but union does not allow null: ${JSON.stringify(schema)}`);
        }
        buffers.push(this.writeZigzagVarint(nullIdx));
        return;
      }

      // Find matching schema in union
      let chosenIndex = -1;
      for (let i = 0; i < schema.length; i++) {
        const s = schema[i];
        if (s === 'null') continue;
        if (typeof s === 'string') {
          if (s === 'string' && typeof value === 'string') { chosenIndex = i; break; }
          if ((s === 'int' || s === 'long') && typeof value === 'number') { chosenIndex = i; break; }
          if (s === 'boolean' && typeof value === 'boolean') { chosenIndex = i; break; }
          if (s === 'bytes' && (Buffer.isBuffer(value) || typeof value === 'string')) { chosenIndex = i; break; }
        } else if (typeof s === 'object') {
          if (s.type === 'record' && typeof value === 'object') { chosenIndex = i; break; }
          if (s.type === 'map' && typeof value === 'object') { chosenIndex = i; break; }
        }
      }

      if (chosenIndex === -1) {
        // Fallback to first non-null branch
        chosenIndex = schema.findIndex(s => s !== 'null');
      }

      buffers.push(this.writeZigzagVarint(chosenIndex));
      this._encodeValue(schema[chosenIndex], value, buffers);
      return;
    }

    // 3. Complex Schema Types
    if (typeof schema === 'object' && schema !== null) {
      const type = schema.type;
      switch (type) {
        case 'record': {
          const valObj = value || {};
          if (!schema.fields || !Array.isArray(schema.fields)) {
            throw new Error(`Record schema missing valid 'fields' array`);
          }
          for (const field of schema.fields) {
            let fieldVal = valObj[field.name];
            if (fieldVal === undefined && field.default !== undefined) {
              fieldVal = field.default;
            }
            this._encodeValue(field.type, fieldVal, buffers);
          }
          return;
        }

        case 'map': {
          // Map is encoded as a series of blocks ending with block count 0
          const valObj = value || {};
          const entries = Object.entries(valObj);
          if (entries.length > 0) {
            buffers.push(this.writeZigzagVarint(entries.length));
            for (const [key, val] of entries) {
              const keyBuf = Buffer.from(String(key), 'utf8');
              buffers.push(this.writeZigzagVarint(keyBuf.length));
              buffers.push(keyBuf);
              this._encodeValue(schema.values, val, buffers);
            }
          }
          // Terminating block 0
          buffers.push(this.writeZigzagVarint(0));
          return;
        }

        case 'array': {
          const items = Array.isArray(value) ? value : [];
          if (items.length > 0) {
            buffers.push(this.writeZigzagVarint(items.length));
            for (const item of items) {
              this._encodeValue(schema.items, item, buffers);
            }
          }
          buffers.push(this.writeZigzagVarint(0));
          return;
        }

        case 'enum': {
          const symbols = schema.symbols || [];
          const idx = symbols.indexOf(value);
          buffers.push(this.writeZigzagVarint(idx >= 0 ? idx : 0));
          return;
        }

        default:
          if (typeof type === 'string') {
            this._encodeValue(type, value, buffers);
            return;
          }
          throw new Error(`Unsupported schema complex type: "${type}"`);
      }
    }

    throw new Error(`Invalid schema definition: ${JSON.stringify(schema)}`);
  }

  /**
   * Decodes an Avro binary buffer back into a JavaScript object
   */
  static decode(schema, buffer, offset = 0) {
    const { value } = this._decodeValue(schema, buffer, offset);
    return value;
  }

  /**
   * Internal recursive decoder returning { value, nextOffset }
   */
  static _decodeValue(schema, buffer, offset) {
    if (typeof schema === 'string') {
      switch (schema) {
        case 'null':
          return { value: null, nextOffset: offset };
        case 'boolean': {
          const val = buffer[offset] !== 0;
          return { value: val, nextOffset: offset + 1 };
        }
        case 'int':
        case 'long': {
          const res = this.readZigzagVarint(buffer, offset);
          return { value: res.value, nextOffset: res.nextOffset };
        }
        case 'float': {
          const val = buffer.readFloatLE(offset);
          return { value: val, nextOffset: offset + 4 };
        }
        case 'double': {
          const val = buffer.readDoubleLE(offset);
          return { value: val, nextOffset: offset + 8 };
        }
        case 'bytes': {
          const lenRes = this.readZigzagVarint(buffer, offset);
          const len = lenRes.value;
          const start = lenRes.nextOffset;
          const bytes = buffer.subarray(start, start + len);
          return { value: bytes, nextOffset: start + len };
        }
        case 'string': {
          const lenRes = this.readZigzagVarint(buffer, offset);
          const len = lenRes.value;
          const start = lenRes.nextOffset;
          const str = buffer.toString('utf8', start, start + len);
          return { value: str, nextOffset: start + len };
        }
        default:
          throw new Error(`Unsupported primitive schema type: "${schema}"`);
      }
    }

    // Unions
    if (Array.isArray(schema)) {
      const idxRes = this.readZigzagVarint(buffer, offset);
      const chosenSchema = schema[idxRes.value];
      if (!chosenSchema) {
        throw new Error(`Union index ${idxRes.value} out of range (length: ${schema.length})`);
      }
      return this._decodeValue(chosenSchema, buffer, idxRes.nextOffset);
    }

    // Complex Types
    if (typeof schema === 'object' && schema !== null) {
      const type = schema.type;
      switch (type) {
        case 'record': {
          const result = {};
          let cursor = offset;
          for (const field of schema.fields) {
            const dec = this._decodeValue(field.type, buffer, cursor);
            result[field.name] = dec.value;
            cursor = dec.nextOffset;
          }
          return { value: result, nextOffset: cursor };
        }

        case 'map': {
          const map = {};
          let cursor = offset;
          while (cursor < buffer.length) {
            const countRes = this.readZigzagVarint(buffer, cursor);
            const count = countRes.value;
            cursor = countRes.nextOffset;
            if (count === 0) break;

            for (let i = 0; i < Math.abs(count); i++) {
              const keyLenRes = this.readZigzagVarint(buffer, cursor);
              const keyLen = keyLenRes.value;
              cursor = keyLenRes.nextOffset;
              const key = buffer.toString('utf8', cursor, cursor + keyLen);
              cursor += keyLen;

              const valRes = this._decodeValue(schema.values, buffer, cursor);
              map[key] = valRes.value;
              cursor = valRes.nextOffset;
            }
          }
          return { value: map, nextOffset: cursor };
        }

        case 'array': {
          const arr = [];
          let cursor = offset;
          while (cursor < buffer.length) {
            const countRes = this.readZigzagVarint(buffer, cursor);
            const count = countRes.value;
            cursor = countRes.nextOffset;
            if (count === 0) break;

            for (let i = 0; i < Math.abs(count); i++) {
              const itemRes = this._decodeValue(schema.items, buffer, cursor);
              arr.push(itemRes.value);
              cursor = itemRes.nextOffset;
            }
          }
          return { value: arr, nextOffset: cursor };
        }

        case 'enum': {
          const symRes = this.readZigzagVarint(buffer, offset);
          const symbol = (schema.symbols || [])[symRes.value];
          return { value: symbol, nextOffset: symRes.nextOffset };
        }

        default:
          if (typeof type === 'string') {
            return this._decodeValue(type, buffer, offset);
          }
          throw new Error(`Unsupported schema complex type: "${type}"`);
      }
    }

    throw new Error(`Invalid schema definition: ${JSON.stringify(schema)}`);
  }

  /**
   * Encodes using Apache Avro Single Object Encoding (RFC format)
   * Header: 2 bytes magic (0xC3, 0x01) + 8 bytes fingerprint + Avro payload
   */
  static encodeSingleObject(schema, value, fingerprintBuffer) {
    const payload = this.encode(schema, value);
    const magic = Buffer.from([0xC3, 0x01]);
    const fp = fingerprintBuffer || Buffer.alloc(8);
    return Buffer.concat([magic, fp, payload]);
  }

  /**
   * Decodes an Apache Avro Single Object Encoded buffer
   */
  static decodeSingleObject(schema, buffer) {
    if (buffer.length < 10) {
      throw new Error('Buffer too small for Avro Single Object Encoding header');
    }
    if (buffer[0] !== 0xC3 || buffer[1] !== 0x01) {
      throw new Error(`Invalid Avro magic bytes: 0x${buffer[0].toString(16)} 0x${buffer[1].toString(16)}`);
    }
    const payload = buffer.subarray(10);
    return this.decode(schema, payload);
  }

  /**
   * Computes payload compression statistics against equivalent JSON
   */
  static getCompressionMetrics(data, avroBuffer) {
    const jsonString = JSON.stringify(data);
    const jsonBytes = Buffer.byteLength(jsonString, 'utf8');
    const avroBytes = avroBuffer.length;
    const savingsBytes = Math.max(0, jsonBytes - avroBytes);
    const compressionRatio = Number(((savingsBytes / jsonBytes) * 100).toFixed(1));
    return {
      jsonBytes,
      avroBytes,
      savingsBytes,
      compressionRatio: `${compressionRatio}%`,
      ratioFactor: Number((jsonBytes / avroBytes).toFixed(2))
    };
  }
}

module.exports = AvroSerializer;

