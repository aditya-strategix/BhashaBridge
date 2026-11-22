const BhashiniSTTAdapter = require('./bhashini.adapter');
const WhisperAudioTapAdapter = require('./whisper.adapter');

module.exports = {
  BhashiniSTTAdapter,
  WhisperAudioTapAdapter,
  defaultSTT: new BhashiniSTTAdapter()
};
