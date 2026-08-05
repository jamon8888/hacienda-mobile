// audioEncoding.ts - Convert the base64 PCM16LE audio emitted by VoiceAudioModule
// into the int16 sample array CactusSTT.transcribe expects.

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_LOOKUP = (() => {
  const table = new Uint8Array(256);
  for (let i = 0; i < BASE64_CHARS.length; i++) {
    table[BASE64_CHARS.charCodeAt(i)] = i;
  }
  return table;
})();

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/=+$/, '').replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 6) / 8));

  let byteIndex = 0;
  let buffer = 0;
  let bitsCollected = 0;

  for (let i = 0; i < clean.length; i++) {
    buffer = (buffer << 6) | BASE64_LOOKUP[clean.charCodeAt(i)];
    bitsCollected += 6;
    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      bytes[byteIndex++] = (buffer >> bitsCollected) & 0xff;
    }
  }

  return bytes;
}

/** Decodes little-endian PCM16 audio (as produced by VoiceAudioModule) into signed samples. */
export function pcmBase64ToInt16Samples(base64: string): number[] {
  const bytes = base64ToBytes(base64);
  const sampleCount = Math.floor(bytes.length / 2);
  const samples = new Array<number>(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const value = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
    samples[i] = value >= 0x8000 ? value - 0x10000 : value;
  }

  return samples;
}
