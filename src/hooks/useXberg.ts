import { useState, useCallback } from "react";
import { xbergStore } from "../store/XbergStore";
import { ExtractionConfig, ExtractionResult } from "../utils/Xberg/types";

export function useXberg() {
  const [status, setStatus] = useState(xbergStore.status);
  const [progress, setProgress] = useState(xbergStore.progress);
  const [error, setError] = useState(xbergStore.error);

  const extractFile = useCallback(
    async (filePath: string, config: ExtractionConfig = {}) => {
      setStatus("processing");
      setProgress(0);
      setError(null);
      const result = await xbergStore.extractFile(filePath, config);
      setStatus(result ? "completed" : "error");
      setProgress(100);
      if (!result) setError(xbergStore.error);
      return result;
    },
    [],
  );

  const extractBatch = useCallback(
    async (filePaths: string[], config: ExtractionConfig = {}) => {
      setStatus("processing");
      setProgress(0);
      setError(null);
      const result = await xbergStore.extractBatch(filePaths, config);
      setStatus(result ? "completed" : "error");
      setProgress(100);
      if (!result) setError(xbergStore.error);
      return result;
    },
    [],
  );

  return { extractFile, extractBatch, status, progress, error };
}
