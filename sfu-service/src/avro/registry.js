const fs = require('fs');
const path = require('path');
const AvroSerializer = require('./serializer');

/**
 * Avro Schema Registry
 * Central repository for registered .avsc contracts, supporting schema lookup by
 * name, namespace, or 64-bit fingerprint ID, with validation and serialization shortcuts.
 */
class SchemaRegistry {
  constructor() {
    this.schemasByName = new Map();
    this.schemasByFullName = new Map();
    this.schemasByFingerprint = new Map();
    this.fingerprintsByName = new Map();
  }

  /**
   * Computes an 8-byte (64-bit) fingerprint buffer for a canonical schema JSON string
   * Uses 64-bit FNV-1a hash algorithm for deterministic, collision-resistant identification.
   */
  static computeFingerprint(schema) {
    const canonical = typeof schema === 'string' ? schema : JSON.stringify(schema);
    const FNV_PRIME = 0x100000001b3n;
    const FNV_OFFSET = 0xcbf29ce484222325n;

    let hash = FNV_OFFSET;
    const buf = Buffer.from(canonical, 'utf8');
    for (let i = 0; i < buf.length; i++) {
      hash ^= BigInt(buf[i]);
      hash = (hash * FNV_PRIME) & 0xffffffffffffffffn;
    }

    const fingerprintBuf = Buffer.alloc(8);
    fingerprintBuf.writeBigUInt64LE(hash, 0);
    return fingerprintBuf;
  }

  /**
   * Registers an Avro schema object or raw JSON string
   */
  register(schemaInput) {
    const schema = typeof schemaInput === 'string' ? JSON.parse(schemaInput) : schemaInput;
    if (!schema.name) {
      throw new Error('Avro schema must contain a "name" property');
    }

    const name = schema.name;
    const namespace = schema.namespace || '';
    const fullName = namespace ? `${namespace}.${name}` : name;
    const fingerprintBuf = SchemaRegistry.computeFingerprint(schema);
    const fingerprintHex = fingerprintBuf.toString('hex');

    this.schemasByName.set(name, schema);
    this.schemasByFullName.set(fullName, schema);
    this.schemasByFingerprint.set(fingerprintHex, schema);
    this.fingerprintsByName.set(name, fingerprintBuf);
    this.fingerprintsByName.set(fullName, fingerprintBuf);

    return { name, fullName, fingerprintHex, fingerprintBuf, schema };
  }

  /**
   * Loads all `.avsc` files from a given directory
   */
  loadFromDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      console.warn(`[SchemaRegistry] Directory not found: ${dirPath}`);
      return [];
    }

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.avsc'));
    const loaded = [];
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const reg = this.register(content);
        loaded.push(reg);
      } catch (err) {
        console.error(`[SchemaRegistry] Error loading schema file "${file}":`, err.message);
      }
    }
    return loaded;
  }

  /**
   * Retrieves a schema by name, full name, or fingerprint hex
   */
  getSchema(identifier) {
    if (this.schemasByName.has(identifier)) {
      return this.schemasByName.get(identifier);
    }
    if (this.schemasByFullName.has(identifier)) {
      return this.schemasByFullName.get(identifier);
    }
    if (this.schemasByFingerprint.has(identifier)) {
      return this.schemasByFingerprint.get(identifier);
    }
    return null;
  }

  /**
   * Returns the 8-byte fingerprint buffer for a schema name
   */
  getFingerprint(name) {
    return this.fingerprintsByName.get(name) || null;
  }

  /**
   * Checks if schema is registered
   */
  hasSchema(identifier) {
    return this.schemasByName.has(identifier) ||
      this.schemasByFullName.has(identifier) ||
      this.schemasByFingerprint.has(identifier);
  }

  /**
   * Lists all registered schemas with metadata
   */
  listSchemas() {
    const list = [];
    for (const [name, schema] of this.schemasByName.entries()) {
      const fpBuf = this.fingerprintsByName.get(name);
      list.push({
        name,
        namespace: schema.namespace || '',
        fullName: schema.namespace ? `${schema.namespace}.${name}` : name,
        type: schema.type,
        doc: schema.doc || '',
        fingerprint: fpBuf ? fpBuf.toString('hex') : '',
        fieldsCount: Array.isArray(schema.fields) ? schema.fields.length : 0,
        fields: Array.isArray(schema.fields) ? schema.fields.map(f => ({ name: f.name, type: f.type })) : []
      });
    }
    return list;
  }

  /**
   * Validates an object against a registered schema
   */
  validate(schemaName, data) {
    const schema = this.getSchema(schemaName);
    if (!schema) {
      throw new Error(`Schema "${schemaName}" is not registered in SchemaRegistry`);
    }
    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['Payload must be a non-null object'] };
    }

    const errors = [];
    if (schema.type === 'record' && Array.isArray(schema.fields)) {
      for (const field of schema.fields) {
        const val = data[field.name];
        if (val === undefined && field.default === undefined) {
          // If union allows null, missing is permissible if handled
          const allowsNull = Array.isArray(field.type) && field.type.includes('null');
          if (!allowsNull) {
            errors.push(`Missing required field: "${field.name}"`);
          }
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * Serializes a JavaScript object into pure Avro binary buffer using a registered schema
   */
  serialize(schemaName, data) {
    const schema = this.getSchema(schemaName);
    if (!schema) {
      throw new Error(`Schema "${schemaName}" is not registered in SchemaRegistry`);
    }
    return AvroSerializer.encode(schema, data);
  }

  /**
   * Deserializes an Avro binary buffer back to JavaScript object
   */
  deserialize(schemaName, buffer) {
    const schema = this.getSchema(schemaName);
    if (!schema) {
      throw new Error(`Schema "${schemaName}" is not registered in SchemaRegistry`);
    }
    return AvroSerializer.decode(schema, buffer);
  }

  /**
   * Serializes using Single Object Encoding (Header + 8-byte Fingerprint + Payload)
   */
  serializeSingleObject(schemaName, data) {
    const schema = this.getSchema(schemaName);
    if (!schema) {
      throw new Error(`Schema "${schemaName}" is not registered in SchemaRegistry`);
    }
    const fp = this.getFingerprint(schemaName);
    return AvroSerializer.encodeSingleObject(schema, data, fp);
  }

  /**
   * Deserializes a Single Object Encoded buffer by dynamically identifying its schema fingerprint
   */
  deserializeSingleObject(buffer) {
    if (buffer.length < 10) {
      throw new Error('Buffer too small for Avro Single Object Encoding');
    }
    if (buffer[0] !== 0xC3 || buffer[1] !== 0x01) {
      throw new Error(`Invalid Avro magic bytes: 0x${buffer[0].toString(16)} 0x${buffer[1].toString(16)}`);
    }

    const fpBuf = buffer.subarray(2, 10);
    const fpBHex = fpBuf.toString('hex');
    const schema = this.schemasByFingerprint.get(fpBHex);
    if (!schema) {
      throw new Error(`Unknown schema fingerprint "${fpBHex}". Schema not found in registry.`);
    }

    const payload = buffer.subarray(10);
    return {
      schemaName: schema.name,
      fullName: schema.namespace ? `${schema.namespace}.${schema.name}` : schema.name,
      fingerprint: fpBHex,
      data: AvroSerializer.decode(schema, payload)
    };
  }
}

// Create a singleton instance and auto-load schemas
const defaultRegistry = new SchemaRegistry();
const primarySchemasDir = path.join(__dirname, '../schemas');
const fallbackSchemasDir = path.join(__dirname, 'schemas');

if (fs.existsSync(primarySchemasDir)) {
  defaultRegistry.loadFromDirectory(primarySchemasDir);
} else if (fs.existsSync(fallbackSchemasDir)) {
  defaultRegistry.loadFromDirectory(fallbackSchemasDir);
}

module.exports = {
  SchemaRegistry,
  registry: defaultRegistry
};

