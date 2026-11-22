const fs = require('fs');
const path = require('path');
const AvroSerializer = require('./serializer');

/**
 * Avro Schema Registry (Backend Client)
 * Automatically registers bundled schemas in schemas/ and optionally syncs from
 * the remote AI Microservice Schema Registry (GET /api/v1/ai/schemas).
 */
class SchemaRegistry {
  constructor() {
    this.schemasByName = new Map();
    this.schemasByFullName = new Map();
    this.schemasByFingerprint = new Map();
    this.fingerprintsByName = new Map();
  }

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

  loadFromDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      return [];
    }

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.avsc'));
    const loaded = [];
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dirPath, file), 'utf8');
        loaded.push(this.register(content));
      } catch (err) {
        console.error(`[Backend SchemaRegistry] Error loading "${file}":`, err.message);
      }
    }
    return loaded;
  }

  /**
   * Syncs schemas dynamically over HTTP from a remote Schema Registry server
   */
  async syncFromRemote(registryUrl) {
    try {
      const res = await fetch(`${registryUrl.replace(/\/+$/, '')}/api/v1/ai/schemas`, {
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        const body = await res.json();
        if (Array.isArray(body.schemas)) {
          for (const s of body.schemas) {
            // Fetch definition if needed or register
            const defRes = await fetch(`${registryUrl.replace(/\/+$/, '')}/api/v1/ai/schemas/${s.name}`);
            if (defRes.ok) {
              const schemaDef = await defRes.json();
              this.register(schemaDef);
            }
          }
          console.log(`[Backend SchemaRegistry] Successfully synced ${body.schemas.length} schemas from remote AI service.`);
        }
      }
    } catch (e) {
      // Remote sync is optional; local schemas act as reliable fallback
    }
  }

  getSchema(identifier) {
    return this.schemasByName.get(identifier) ||
      this.schemasByFullName.get(identifier) ||
      this.schemasByFingerprint.get(identifier) ||
      null;
  }

  getFingerprint(name) {
    return this.fingerprintsByName.get(name) || null;
  }

  hasSchema(identifier) {
    return this.schemasByName.has(identifier) ||
      this.schemasByFullName.has(identifier) ||
      this.schemasByFingerprint.has(identifier);
  }

  listSchemas() {
    const list = [];
    for (const [name, schema] of this.schemasByName.entries()) {
      const fpBuf = this.fingerprintsByName.get(name);
      list.push({
        name,
        namespace: schema.namespace || '',
        fullName: schema.namespace ? `${schema.namespace}.${name}` : name,
        type: schema.type,
        fingerprint: fpBuf ? fpBuf.toString('hex') : ''
      });
    }
    return list;
  }

  serialize(schemaName, data) {
    const schema = this.getSchema(schemaName);
    if (!schema) {
      throw new Error(`Schema "${schemaName}" is not registered in SchemaRegistry`);
    }
    return AvroSerializer.encode(schema, data);
  }

  deserialize(schemaName, buffer) {
    const schema = this.getSchema(schemaName);
    if (!schema) {
      throw new Error(`Schema "${schemaName}" is not registered in SchemaRegistry`);
    }
    return AvroSerializer.decode(schema, buffer);
  }
}

const defaultRegistry = new SchemaRegistry();
const localSchemasDir = path.join(__dirname, 'schemas');
defaultRegistry.loadFromDirectory(localSchemasDir);

module.exports = {
  SchemaRegistry,
  registry: defaultRegistry
};

