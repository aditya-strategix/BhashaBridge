const BhashiniTTSAdapter = require('./bhashini.adapter');

module.exports = {
  BhashiniTTSAdapter,
  defaultTTS: new BhashiniTTSAdapter()
};
