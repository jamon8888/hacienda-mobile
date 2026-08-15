import { useCallback } from "react";

import type { CactusLMTool } from "cactus-react-native";

import needleStore from "@/store/NeedleStore";
import type { NeedleRouteDecision, RouteOptions } from "@/utils/Needle";

export function useNeedle() {
  const init = useCallback(
    (onProgress?: (progress: number) => void) => needleStore.init(onProgress),
    [],
  );

  const routeRag = useCallback(
    (query: string, opts?: RouteOptions): Promise<NeedleRouteDecision> =>
      needleStore.routeRag(query, opts),
    [],
  );

  const selectTools = useCallback(
    (
      query: string,
      tools: CactusLMTool[],
      topK?: number,
    ): Promise<CactusLMTool[]> => needleStore.selectTools(query, tools, topK),
    [],
  );

  return {
    ready: needleStore.ready,
    busy: needleStore.busy,
    error: needleStore.error,
    lastRoute: needleStore.lastRoute,
    init,
    routeRag,
    selectTools,
  };
}
