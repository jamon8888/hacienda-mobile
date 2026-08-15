import { pcmBase64ToInt16Samples } from "./audioEncoding";

describe("pcmBase64ToInt16Samples", () => {
  it("decodes little-endian PCM16 base64 into signed sample values", () => {
    // Fixture: struct.pack('<h', s) for each sample below, concatenated and base64-encoded.
    const base64 = "AAABAP///38AgGQAnP8=";
    const samples = [0, 1, -1, 32767, -32768, 100, -100];

    expect(pcmBase64ToInt16Samples(base64)).toEqual(samples);
  });

  it("returns an empty array for empty input", () => {
    expect(pcmBase64ToInt16Samples("")).toEqual([]);
  });

  it("drops a trailing odd byte instead of throwing", () => {
    // Fixture: bytes [0x01, 0x00, 0xff] base64-encoded -> one complete sample (1) plus a stray byte.
    const base64 = "AQD/";

    expect(pcmBase64ToInt16Samples(base64)).toEqual([1]);
  });
});
