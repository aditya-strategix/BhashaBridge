const BhashiniSTTAdapter = require('./bhashini.adapter');
const WhisperAudioTapAdapter = require('./whisper.adapter');

const whisperSTT = new WhisperAudioTapAdapter();
const bhashiniSTT = new BhashiniSTTAdapter();

module.exports = {
  BhashiniSTTAdapter,
  WhisperAudioTapAdapter,
  whisperSTT,
  bhashiniSTT,
  defaultSTT: whisperSTT
};
