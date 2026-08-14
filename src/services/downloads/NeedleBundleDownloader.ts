import * as RNFS from "@dr.pogodin/react-native-fs";
import JSZip from "jszip";

const NEEDLE_CQ4_URL =
  "https://huggingface.co/Cactus-Compute/needle/resolve/main/needle-cq4.zip";

export const NEEDLE_BUNDLE_NAME = "needle";

/**
 * Download and extract the official Cactus Needle CQ4 bundle.
 *
 * We bypass `cactus-react-native`'s registry because it only accepts models
 * with both `weights/*-int4.zip` and `weights/*-int8.zip` plus SemVer tags.
 * Needle ships as a single root-level `needle-cq4.zip`, which we download
 * with RNFS and extract in pure JS with jszip (already in the dep tree).
 */
export class NeedleBundleDownloader {
  constructor(
    private readonly bundleName: string = NEEDLE_BUNDLE_NAME,
    private readonly bundleUrl: string = NEEDLE_CQ4_URL,
  ) {}

  async ensureDownloaded(
    onProgress?: (progress: number) => void,
  ): Promise<string> {
    const extractDir = `${RNFS.DocumentDirectoryPath}/models/${this.bundleName}`;

    if (await RNFS.exists(`${extractDir}/config.txt`)) {
      return extractDir;
    }

    const zipPath = `${RNFS.DocumentDirectoryPath}/models/${this.bundleName}.zip`;

    await RNFS.mkdir(`${RNFS.DocumentDirectoryPath}/models`);

    const result = await RNFS.downloadFile({
      fromUrl: this.bundleUrl,
      toFile: zipPath,
      begin: () => {},
      progress: res => {
        const progress = res.contentLength
          ? res.bytesWritten / res.contentLength
          : 0;
        onProgress?.(progress);
      },
    }).promise;

    if (result.statusCode !== 200) {
      throw new Error(
        `Needle bundle download failed with status ${result.statusCode}`,
      );
    }

    const zipData = await RNFS.readFile(zipPath, "base64");
    const zip = await JSZip.loadAsync(zipData, { base64: true });

    for (const [relativePath, entry] of Object.entries(zip.files)) {
      if (entry.dir) {
        await RNFS.mkdir(`${extractDir}/${relativePath}`);
        continue;
      }

      const fileData = await entry.async("base64");
      const filePath = `${extractDir}/${relativePath}`;
      const dir = filePath.split("/").slice(0, -1).join("/");
      if (!(await RNFS.exists(dir))) {
        await RNFS.mkdir(dir);
      }
      await RNFS.writeFile(filePath, fileData, "base64");
    }

    await RNFS.unlink(zipPath);

    return extractDir;
  }
}
