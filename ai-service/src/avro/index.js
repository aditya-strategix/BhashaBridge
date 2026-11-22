const { SchemaRegistry, registry } = require('./registry');
const AvroSerializer = require('./serializer');

module.exports = {
  SchemaRegistry,
  registry,
  AvroSerializer,
  encode: (schema, val) => AvroSerializer.encode(schema, val),
  decode: (schema, buf) => AvroSerializer.decode(schema, buf),
  serialize: (schemaName, data) => registry.serialize(schemaName, data),
  deserialize: (schemaName, buffer) => registry.deserialize(schemaName, buffer),
  serializeSingleObject: (schemaName, data) => registry.serializeSingleObject(schemaName, data),
  deserializeSingleObject: (buffer) => registry.deserializeSingleObject(buffer),
  getCompressionMetrics: (data, avroBuffer) => AvroSerializer.getCompressionMetrics(data, avroBuffer)
};

