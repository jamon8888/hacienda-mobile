import { NativeModules } from "react-native";

// XbergClient captures NativeModules.XbergModule at import time, so the mock has to be installed
// before the module is required.
const nativeMock = {
  extract: jest.fn(),
  extractBatch: jest.fn(),
  getSupportedFormats: jest.fn(),
  transcribeAudio: jest.fn(),
};
(NativeModules as Record<string, unknown>).XbergModule = nativeMock;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { XbergClient } = require("./XbergClient");

/** The native modules resolve a JSON string, never an object — see parseExtractionResult. */
function nativeEnvelope(results: unknown[], errors: unknown[] = []): string {
  return JSON.stringify({ results, errors, summary: {} });
}

function docResult(content: string, source?: string) {
  return {
    ...(source ? { source } : {}),
    content,
    metadata: { format: "pdf", mimeType: "application/pdf", size: 1 },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("extract", () => {
  it("parses the JSON string the native module resolves", async () => {
    nativeMock.extract.mockResolvedValue(nativeEnvelope([docResult("hello")]));

    const result = await XbergClient.extract("/docs/a.pdf");

    expect(result.results).toHaveLength(1);
    expect(result.results[0].content).toBe("hello");
  });

  it("accepts an already-parsed object, so a future native change does not break callers", async () => {
    nativeMock.extract.mockResolvedValue({ results: [docResult("hello")] });

    const result = await XbergClient.extract("/docs/a.pdf");

    expect(result.results[0].content).toBe("hello");
  });

  it("reports malformed native JSON as an error instead of returning a string", async () => {
    nativeMock.extract.mockResolvedValue("not json at all");

    await expect(XbergClient.extract("/docs/a.pdf")).rejects.toThrow(
      /malformed JSON/,
    );
  });

  it("normalises a missing results array to an empty one", async () => {
    nativeMock.extract.mockResolvedValue(JSON.stringify({ summary: {} }));

    const result = await XbergClient.extract("/docs/a.pdf");

    expect(result.results).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("routes audio to transcription rather than the document extractors", async () => {
    nativeMock.transcribeAudio.mockResolvedValue(
      nativeEnvelope([docResult("spoken words")]),
    );

    const result = await XbergClient.extract("/media/note.m4a", {
      transcription: { model: "base", language: "fr" },
    });

    expect(nativeMock.extract).not.toHaveBeenCalled();
    expect(nativeMock.transcribeAudio).toHaveBeenCalledWith(
      "/media/note.m4a",
      "base",
      "fr",
    );
    expect(result.results[0].content).toBe("spoken words");
  });

  it("forces OCR for images when an OCR backend is configured but forceOcr is unset", async () => {
    nativeMock.extract.mockResolvedValue(
      nativeEnvelope([docResult("scanned")]),
    );

    await XbergClient.extract("/photos/receipt.png", {
      ocr: { backend: "tesseract" },
    });

    const sentConfig = JSON.parse(nativeMock.extract.mock.calls[0][1]);
    expect(sentConfig.forceOcr).toBe(true);
  });

  it("respects an explicit forceOcr:false on an image", async () => {
    nativeMock.extract.mockResolvedValue(
      nativeEnvelope([docResult("scanned")]),
    );

    await XbergClient.extract("/photos/receipt.png", {
      ocr: { backend: "tesseract" },
      forceOcr: false,
    });

    const sentConfig = JSON.parse(nativeMock.extract.mock.calls[0][1]);
    expect(sentConfig.forceOcr).toBe(false);
  });
});

describe("extractBatch", () => {
  it("splits the input across several native calls and merges the results", async () => {
    nativeMock.extractBatch.mockImplementation((paths: string[]) =>
      Promise.resolve(
        nativeEnvelope(paths.map((p: string) => docResult(`content:${p}`, p))),
      ),
    );
    const paths = Array.from({ length: 5 }, (_, i) => `/docs/f${i}.pdf`);

    const result = await XbergClient.extractBatch(paths, {}, { chunkSize: 2 });

    expect(nativeMock.extractBatch).toHaveBeenCalledTimes(3);
    expect(result.results.map((r: { source?: string }) => r.source)).toEqual(
      paths,
    );
  });

  it("reports progress once per chunk, ending at the total", async () => {
    nativeMock.extractBatch.mockImplementation((paths: string[]) =>
      Promise.resolve(
        nativeEnvelope(paths.map((p: string) => docResult("x", p))),
      ),
    );
    const progress: number[] = [];

    await XbergClient.extractBatch(
      ["/a.pdf", "/b.pdf", "/c.pdf", "/d.pdf", "/e.pdf"],
      {},
      {
        chunkSize: 2,
        onProgress: ({ done }: { done: number }) => progress.push(done),
      },
    );

    expect(progress).toEqual([2, 4, 5]);
  });

  it("keeps successful chunks when another chunk rejects", async () => {
    nativeMock.extractBatch
      .mockResolvedValueOnce(
        nativeEnvelope([
          docResult("ok-a", "/a.pdf"),
          docResult("ok-b", "/b.pdf"),
        ]),
      )
      .mockRejectedValueOnce(new Error("native blew up"));

    const result = await XbergClient.extractBatch(
      ["/a.pdf", "/b.pdf", "/c.pdf", "/d.pdf"],
      {},
      { chunkSize: 2 },
    );

    expect(result.results.map((r: { source?: string }) => r.source)).toEqual([
      "/a.pdf",
      "/b.pdf",
    ]);
    expect(result.errors).toEqual([
      { source: "/c.pdf", error: "native blew up", code: "BATCH_CHUNK_FAILED" },
      { source: "/d.pdf", error: "native blew up", code: "BATCH_CHUNK_FAILED" },
    ]);
  });

  it("transcribes audio separately and tags each transcript with its source path", async () => {
    nativeMock.extractBatch.mockResolvedValue(
      nativeEnvelope([docResult("doc", "/a.pdf")]),
    );
    // The single-file transcription path never tags a source; extractBatch must add it.
    nativeMock.transcribeAudio.mockResolvedValue(
      nativeEnvelope([docResult("spoken")]),
    );

    const result = await XbergClient.extractBatch(["/a.pdf", "/voice.mp3"]);

    expect(nativeMock.extractBatch).toHaveBeenCalledWith(
      ["/a.pdf"],
      expect.any(String),
    );
    const bySource = Object.fromEntries(
      result.results.map((r: { source?: string; content: string }) => [
        r.source,
        r.content,
      ]),
    );
    expect(bySource).toEqual({ "/a.pdf": "doc", "/voice.mp3": "spoken" });
  });

  it("records a failed transcription as an error rather than aborting the batch", async () => {
    nativeMock.extractBatch.mockResolvedValue(
      nativeEnvelope([docResult("doc", "/a.pdf")]),
    );
    nativeMock.transcribeAudio.mockRejectedValue(new Error("no whisper model"));

    const result = await XbergClient.extractBatch(["/a.pdf", "/voice.mp3"]);

    expect(result.results).toHaveLength(1);
    expect(result.errors).toEqual([
      {
        source: "/voice.mp3",
        error: "no whisper model",
        code: "TRANSCRIPTION_ERROR",
      },
    ]);
  });

  it("does not call the native module for an empty input", async () => {
    const result = await XbergClient.extractBatch([]);

    expect(nativeMock.extractBatch).not.toHaveBeenCalled();
    expect(result).toEqual({ results: [], errors: [] });
  });
});

describe("file kind detection", () => {
  it("matches on the extension, not on a substring of the name", () => {
    // '.mp3' appearing mid-name must not make a PDF look like audio.
    expect(XbergClient.isAudioFile("/docs/about-mp3-codecs.pdf")).toBe(false);
    expect(XbergClient.isAudioFile("/docs/talk.MP3")).toBe(true);
    expect(XbergClient.isImageFile("/docs/notes.png")).toBe(true);
    expect(XbergClient.isSupportedFile("/docs/archive.zip")).toBe(false);
    expect(XbergClient.isSupportedFile("/docs/report.docx")).toBe(true);
  });
});
