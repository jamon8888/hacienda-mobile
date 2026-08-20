import { CactusLM, type CactusLMTool } from "cactus-react-native";

import * as RNFS from "@dr.pogodin/react-native-fs";
import { Model } from "@/utils/types";
import { defaultModels } from "@/utils/models";
import { CACTUS_CHAT_MODELS } from "@/utils/models/defaults";
import { stops } from "@/utils/chat";
import {
  CompletionParams,
  toApiCompletionParams,
} from "@/utils/chat/completionTypes";
import { ICompleteResponse } from "@/utils/AiProviders/baseOpenAILikeProvider";
import type OnDeviceProvider from "@/utils/AiProviders/onDevice/index";
import needleStore from "@/store/NeedleStore";

export type NativeLlamaChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ICactusLmStreamCallback = (token: string) => void;
export default class CactusLmWrapper {
  static DEFAULT_CONTEXT_LENGTH = 1024;
  static DEFAULT_TEMPERATURE = 0.7;
  static DEFAULT_N_PREDICT = 2048;

  private parent: OnDeviceProvider;
  private model: string;
  private ggufFilePath: string | null = null;
  private cactusLmContext: CactusLM | null = null;
  private initPromise: Promise<boolean> | null = null;
  private keepAliveTimer: ReturnType<typeof setTimeout> | null = null;
  private keepAliveInterval = 1000 * 60 * 5;

  constructor({ model, parent }: { model: string; parent: OnDeviceProvider }) {
    this.model = model;
    this.parent = parent;
    this.presetGGUFFilePath();
  }

  log = (text: string, ...args: any[]) => {
    console.log(`\x1b[36m[${this.constructor.name}]\x1b[0m ${text}`, ...args);
  };

  private presetGGUFFilePath() {
    if (!this.modelDefinition?.ggufFilePath) return;
    this.ggufFilePath = `${RNFS.DocumentDirectoryPath}/models/gguf/${this.modelDefinition.ggufFilePath}`;
  }

  async determineGgufFilePath() {
    if (!this.ggufFilePath) {
      this.log(
        `GGUF file location is not yet set - will find a gguf file in the model directory.`,
      );
      let path = `${RNFS.DocumentDirectoryPath}/models/gguf/${this.model}`;

      if (path.endsWith(".gguf")) {
        if (await RNFS.exists(path)) {
          this.ggufFilePath = path;
          this.log(`GGUF file found at ${this.ggufFilePath}`);
          return this.ggufFilePath;
        } else {
          this.log(
            `GGUF file not found at ${path} - trying to find via subdir`,
          );
          path = path.split("/").slice(0, -1).join("/");
          this.log(`Retrying to find GGUF file in ${path}`);
        }
      }

      const files = await RNFS.readDir(path);
      const ggufFile = files.find(file => file.name.endsWith(".gguf"));
      if (!ggufFile)
        throw new Error(
          `LlamaRnWrapper::ggufFilePath: No gguf file found for model ${this.model}`,
        );
      this.ggufFilePath = `${path}/${ggufFile.name}`;
    }
    return this.ggufFilePath;
  }

  get name() {
    return "cactus.lm";
  }

  get modelDefinition(): Model {
    return defaultModels.find(model => model.id === this.model) as Model;
  }

  get temperature() {
    return (
      this.parent.workspace?.temperature ?? CactusLmWrapper.DEFAULT_TEMPERATURE
    );
  }

  get nPredict() {
    return CactusLmWrapper.DEFAULT_N_PREDICT;
  }

  get contextLength() {
    return (
      this.parent.workspace?.contextLength ??
      CactusLmWrapper.DEFAULT_CONTEXT_LENGTH
    );
  }

  async initialize(): Promise<boolean> {
    if (!!this.cactusLmContext) {
      this.log(`Context already loaded - skipping`);
      return true;
    }
    // Collapse concurrent callers onto the same in-flight init instead of
    // each racing their own CactusLM construction/download/init.
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize().finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  private async doInitialize(): Promise<boolean> {
    try {
      const ref = CACTUS_CHAT_MODELS[this.model];
      if (!ref)
        throw new Error(
          `CactusLmWrapper::initialize: ${this.model} has no Cactus registry bundle. ` +
            `Supported models: ${Object.keys(CACTUS_CHAT_MODELS).join(", ")}`,
        );

      const lm = new CactusLM({
        model: ref.slug,
        options: { quantization: ref.quantization },
      });
      // No-ops when the bundle is on disk; replaces the RNFS download entirely.
      await lm.download({
        onProgress: p => this.log(`download progress ${Math.round(p * 100)}%`),
      });
      await lm.init();
      this.cactusLmContext = lm;
      this.log(
        `${this.name} initialized with model ${this.model} @ ${this.contextLength} context length`,
      );
      return true;
    } catch (error) {
      console.error("Failed to initialize model:", error);
      throw error;
    }
  }

  private get defaultRuntimeConfig(): CompletionParams | {} {
    const extraParams: CompletionParams = {};
    if (!!this.modelDefinition && this.modelDefinition.completionSettings) {
      for (const [key, value] of Object.entries(
        this.modelDefinition.completionSettings,
      )) {
        (extraParams as Record<string, unknown>)[key] = value;
      }
    }
    return extraParams;
  }

  private keepAlive() {
    if (this.keepAliveTimer)
      this.log(
        `Keep alive timer already running - resetting timer for ${this.keepAliveInterval}ms`,
      );
    else this.log(`Starting keep alive timer for ${this.keepAliveInterval}ms`);
    this.keepAliveTimer = setTimeout(() => {
      this.cleanup();
    }, this.keepAliveInterval);
  }

  async getChatCompletion(
    messages: NativeLlamaChatMessage[],
  ): Promise<ICompleteResponse> {
    this.keepAlive();
    if (!this.cactusLmContext) await this.initialize();
    if (!this.cactusLmContext)
      throw new Error(
        `CactusLmWrapper::streamGetChatCompletion: Model not initialized`,
      );

    const apiParams = toApiCompletionParams(
      this.defaultRuntimeConfig as CompletionParams,
    );
    const result = await this.cactusLmContext.complete({
      messages: messages as any,
      options: {
        stopSequences: [...stops],
        maxTokens: this.nPredict,
        ...apiParams,
        temperature: this.temperature,
      },
    });

    return {
      textResponse: result.response,
      metrics: {
        prompt_tokens: result.prefillTokens,
        completion_tokens: result.decodeTokens,
        total_tokens: result.totalTokens,
        outputTps: result.decodeTps,
        duration: result.totalTimeMs,
      },
    };
  }

  private toCactusTools(
    availableTools: {
      function: {
        name: string;
        description?: string;
        parameters: CactusLMTool["parameters"];
      };
    }[],
  ): CactusLMTool[] {
    return availableTools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description ?? "",
      parameters: tool.function.parameters,
    }));
  }

  async streamGetChatCompletion(
    messages: NativeLlamaChatMessage[],
    callback: ICactusLmStreamCallback,
    availableTools: any[],
  ): Promise<ICompleteResponse> {
    this.keepAlive();
    if (!this.cactusLmContext) await this.initialize();
    if (!this.cactusLmContext)
      throw new Error(
        `CactusLmWrapper::streamGetChatCompletion: Model not initialized`,
      );

    let cactusTools = this.toCactusTools(availableTools ?? []);

    // Rank long tool lists with the on-device Needle router when available.
    // If ranking fails or Needle is not ready, we keep the original list. Init is
    // kicked off in the background rather than awaited, so a cold Needle (still
    // downloading/loading its bundle) never blocks this completion -- see the
    // matching comment in baseOpenAILikeProvider.getContextTexts.
    if (needleStore.routerEnabled && cactusTools.length > 5) {
      if (!needleStore.ready && !needleStore.busy) {
        needleStore.init().catch(() => {});
      }
      const lastUserMessage = messages
        .slice()
        .reverse()
        .find(m => m.role === "user");
      if (lastUserMessage && needleStore.ready) {
        this.log(`Needle ranking ${cactusTools.length} tools`);
        cactusTools = await needleStore.selectTools(
          lastUserMessage.content,
          cactusTools,
          5,
        );
        this.log(`Needle selected ${cactusTools.length} tools`);
      }
    }

    const apiParams = toApiCompletionParams(
      this.defaultRuntimeConfig as CompletionParams,
    );

    const result = await this.cactusLmContext.complete({
      messages: messages as any,
      options: {
        stopSequences: [...stops],
        maxTokens: this.nPredict,
        ...apiParams,
        temperature: this.temperature,
      },
      tools: cactusTools.length > 0 ? cactusTools : undefined,
      onToken: (token: string) => {
        callback(token);
      },
    });

    return {
      textResponse: result.response,
      toolCalls: result.functionCalls?.map(fc => ({
        type: "function" as const,
        function: { name: fc.name, arguments: JSON.stringify(fc.arguments) },
      })),
      metrics: {
        prompt_tokens: result.prefillTokens,
        completion_tokens: result.decodeTokens,
        total_tokens: result.totalTokens,
        outputTps: result.decodeTps,
        duration: result.totalTimeMs,
      },
    };
  }

  async unloadModel(): Promise<void> {
    this.log("Unloading model");
    if (this.cactusLmContext) await this.cactusLmContext.destroy();
    this.cactusLmContext = null;
  }

  async cleanup(): Promise<void> {
    this.log("Cleaning up CactusLmWrapper");
    await this.unloadModel();
  }
}
