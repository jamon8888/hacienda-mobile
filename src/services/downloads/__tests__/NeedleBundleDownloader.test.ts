import * as RNFS from "@dr.pogodin/react-native-fs";
import JSZip from "jszip";

import { NeedleBundleDownloader } from "../NeedleBundleDownloader";

jest.mock("@dr.pogodin/react-native-fs", () => ({
  DocumentDirectoryPath: "/mock/Documents",
  exists: jest.fn(),
  mkdir: jest.fn().mockResolvedValue(undefined),
  downloadFile: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
  moveFile: jest.fn().mockResolvedValue(undefined),
}));

const mockZipFiles = {
  "config.txt": "model_type=needle",
  "token_embeddings.weights": "fake-weights",
  "components/nested.txt": "nested-content",
};

function makeMockZip() {
  const zip = new JSZip();
  Object.entries(mockZipFiles).forEach(([path, content]) => {
    zip.file(path, content);
  });
  return zip.generateAsync({ type: "base64" });
}

describe("NeedleBundleDownloader", () => {
  // A minimal stateful fake filesystem. The production completeness check
  // (`RNFS.exists(stagingDir/config.txt)` after extraction, added to guard
  // against a killed-mid-extraction false positive) depends on `exists`
  // actually reflecting prior mkdir/writeFile/unlink/moveFile calls - a
  // blind `mockResolvedValue(false)` makes that check always fail and
  // ensureDownloaded() always throw, regardless of what was really written.
  let fsPaths: Set<string>;

  beforeEach(() => {
    jest.clearAllMocks();
    fsPaths = new Set();

    (RNFS.exists as jest.Mock).mockImplementation(async (path: string) =>
      fsPaths.has(path),
    );
    (RNFS.mkdir as jest.Mock).mockImplementation(async (path: string) => {
      fsPaths.add(path);
    });
    (RNFS.writeFile as jest.Mock).mockImplementation(async (path: string) => {
      fsPaths.add(path);
    });
    (RNFS.unlink as jest.Mock).mockImplementation(async (path: string) => {
      fsPaths.delete(path);
      for (const p of fsPaths) {
        if (p.startsWith(`${path}/`)) fsPaths.delete(p);
      }
    });
    (RNFS.moveFile as jest.Mock).mockImplementation(
      async (from: string, to: string) => {
        for (const p of [...fsPaths]) {
          if (p !== from && !p.startsWith(`${from}/`)) continue;
          fsPaths.delete(p);
          fsPaths.add(to + p.slice(from.length));
        }
      },
    );

    (RNFS.downloadFile as jest.Mock).mockReturnValue({
      promise: Promise.resolve({ statusCode: 200 }),
    });
    (RNFS.readFile as jest.Mock).mockImplementation(() => makeMockZip());
  });

  it("returns existing extract dir without re-downloading if already promoted", async () => {
    fsPaths.add("/mock/Documents/models/needle");

    const downloader = new NeedleBundleDownloader();
    const path = await downloader.ensureDownloaded();

    expect(path).toBe("/mock/Documents/models/needle");
    expect(RNFS.downloadFile).not.toHaveBeenCalled();
  });

  it("re-extracts when the extract dir is missing even if a staging dir was left behind", async () => {
    // Simulates a previous run that was killed mid-extraction: the final extractDir was
    // never promoted, but a partial staging dir is still on disk.
    fsPaths.add("/mock/Documents/models/needle.staging");

    const downloader = new NeedleBundleDownloader();
    const path = await downloader.ensureDownloaded();

    expect(path).toBe("/mock/Documents/models/needle");
    expect(RNFS.downloadFile).toHaveBeenCalled();
    expect(RNFS.unlink).toHaveBeenCalledWith(
      "/mock/Documents/models/needle.staging",
    );
    expect(RNFS.moveFile).toHaveBeenCalledWith(
      "/mock/Documents/models/needle.staging",
      "/mock/Documents/models/needle",
    );
  });

  it("downloads, extracts, and returns the bundle path", async () => {
    const downloader = new NeedleBundleDownloader();
    const onProgress = jest.fn();
    const path = await downloader.ensureDownloaded(onProgress);

    expect(path).toBe("/mock/Documents/models/needle");
    expect(RNFS.downloadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fromUrl:
          "https://huggingface.co/Cactus-Compute/needle/resolve/main/needle-cq4.zip",
        toFile: "/mock/Documents/models/needle.zip",
      }),
    );
    expect(RNFS.writeFile).toHaveBeenCalledWith(
      "/mock/Documents/models/needle.staging/config.txt",
      expect.any(String),
      "base64",
    );
    expect(RNFS.writeFile).toHaveBeenCalledWith(
      "/mock/Documents/models/needle.staging/token_embeddings.weights",
      expect.any(String),
      "base64",
    );
    expect(RNFS.unlink).toHaveBeenCalledWith(
      "/mock/Documents/models/needle.zip",
    );
    expect(RNFS.moveFile).toHaveBeenCalledWith(
      "/mock/Documents/models/needle.staging",
      "/mock/Documents/models/needle",
    );
  });

  it("creates nested directories before writing nested files", async () => {
    const downloader = new NeedleBundleDownloader();
    await downloader.ensureDownloaded();

    expect(RNFS.mkdir).toHaveBeenCalledWith(
      "/mock/Documents/models/needle.staging/components",
    );
    expect(RNFS.writeFile).toHaveBeenCalledWith(
      "/mock/Documents/models/needle.staging/components/nested.txt",
      expect.any(String),
      "base64",
    );
  });

  it("discards the staging dir and throws when extraction never produces config.txt", async () => {
    (RNFS.readFile as jest.Mock).mockImplementation(() => {
      const zip = new JSZip();
      zip.file("token_embeddings.weights", "fake-weights");
      return zip.generateAsync({ type: "base64" });
    });

    const downloader = new NeedleBundleDownloader();
    await expect(downloader.ensureDownloaded()).rejects.toThrow(
      "Needle bundle extraction did not produce config.txt",
    );

    expect(RNFS.unlink).toHaveBeenCalledWith(
      "/mock/Documents/models/needle.staging",
    );
    expect(RNFS.moveFile).not.toHaveBeenCalled();
  });

  it("reports download progress", async () => {
    (RNFS.downloadFile as jest.Mock).mockReturnValue({
      promise: Promise.resolve({ statusCode: 200 }),
    });

    const downloader = new NeedleBundleDownloader();
    const onProgress = jest.fn();
    await downloader.ensureDownloaded(onProgress);

    const progressCallback = (RNFS.downloadFile as jest.Mock).mock.calls[0][0]
      .progress;
    progressCallback({ bytesWritten: 500, contentLength: 1000 });

    expect(onProgress).toHaveBeenCalledWith(0.5);
  });

  it("throws when the download returns a non-200 status", async () => {
    (RNFS.downloadFile as jest.Mock).mockReturnValue({
      promise: Promise.resolve({ statusCode: 404 }),
    });

    const downloader = new NeedleBundleDownloader();
    await expect(downloader.ensureDownloaded()).rejects.toThrow(
      "Needle bundle download failed with status 404",
    );
  });

  it("uses custom bundle name and URL when provided", async () => {
    const downloader = new NeedleBundleDownloader(
      "custom",
      "https://example.com/bundle.zip",
    );
    const path = await downloader.ensureDownloaded();

    expect(path).toBe("/mock/Documents/models/custom");
    expect(RNFS.downloadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fromUrl: "https://example.com/bundle.zip",
        toFile: "/mock/Documents/models/custom.zip",
      }),
    );
  });
});
