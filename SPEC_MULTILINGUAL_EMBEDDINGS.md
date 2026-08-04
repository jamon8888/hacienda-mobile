# Multilingual Embeddings Specification: "Polyglot Mode" 🌍

## Overview
Add **nomic-embed-text-v2-moe** (multilingual, ~100 languages) as an optional embedding engine alongside the default English-only v1.5. Includes intelligent routing, hybrid cloud fallback, and on-device optimizations.

---

## 1. Model Configuration

### 1.1 Model Variants (GGUF)
| Quantization | Size | Quality | Use Case |
|-------------|------|---------|----------|
| **Q4_K_M** (default) | 328 MB | ★★★★☆ | Balanced - recommended |
| Q4_K_S | 310 MB | ★★★★☆ | Space-constrained |
| Q5_K_M | 371 MB | ★★★★★ | High quality |
| Q2_K | 261 MB | ★★☆☆☆ | Ultra-low RAM devices |

### 1.2 Model Metadata
```typescript
// src/utils/models/defaults.ts
export const MULTILINGUAL_EMBEDDING_MODEL = {
  id: 'multilingual',
  name: 'Multilingual (100+ langs)',
  description: 'Nomic Embed v2 MoE - Supports ~100 languages, 512 token context',
  size: '328MB',
  modelId: 'nomic-ai/nomic-embed-text-v2-moe-GGUF',
  tag: 'https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe-GGUF/resolve/main/nomic-embed-text-v2-moe.Q4_K_M.gguf',
  isPreset: true,
  capabilities: ['multilingual', 'matryoshka', 'embedding'],
  contextLength: 512,  // Critical: 512 vs 8192
  dimensions: 768,      // Matryoshka: truncatable to 256/128/64
  activeParams: '305M',
  totalParams: '475M',
}
```

---

## 2. Architecture Changes

### 2.1 Embedding Provider Factory
```typescript
// src/utils/Embedder/factory.ts (NEW)
export type EmbeddingEngine = 'nomic-v1.5' | 'nomic-v2-moe' | 'auto';

interface EmbeddingProvider {
  embed(text: string, as: 'query' | 'embed_document'): Promise<number[]>;
  embedBatch(texts: string[], as: 'query' | 'embed_document'): Promise<number[][]>;
  splitAndEmbed(text: string, config: TextSplitterConfig): Promise<EmbeddingResult[]>;
  getDimensions(): number;
  getContextLength(): number;
  getSupportedLanguages(): string[];
  cleanup(): Promise<void>;
}

export function createEmbeddingProvider(engine: EmbeddingEngine): EmbeddingProvider {
  switch (engine) {
    case 'nomic-v2-moe':
      return new MultilingualEmbedderProvider();
    case 'nomic-v1.5':
    default:
      return new OnDeviceEmbedderProvider(); // existing
  }
}
```

### 2.2 Multilingual Provider (Wraps Cactus)
```typescript
// src/utils/Embedder/onDevice/multilingual.ts (NEW)
export class MultilingualEmbedderProvider implements EmbeddingProvider {
  private cactusLmContext: CactusLM | null = null;
  private modelPath: string;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  
  // v2-moe uses different prefixes (per Nomic docs)
  private PREFIXES = {
    query: 'search_query: ',
    embed_document: 'search_document: ',
    classification: 'classification: ',
    clustering: 'clustering: ',
  };

  async initialize(): Promise<boolean> {
    const { lm, error } = await CactusLM.init({
      model: this.modelPath,
      n_ctx: 512,           // Hard limit for v2-moe
      n_gpu_layers: Platform.OS === 'ios' ? 99 : 0,
      embedding: true,
      use_mlock: true,
    });
    // ...
  }

  // Matryoshka truncation - user can choose dimension
  async embed(text: string, as: 'query' | 'embed_document', dimensions?: 768 | 512 | 256 | 128 | 64): Promise<number[]> {
    const fullEmbedding = await this.cactusLmContext.embedding(
      `${this.PREFIXES[as]}${text}`,
      { embd_normalize: 2 }  // L2 normalization per Nomic recommendation
    );
    return dimensions ? fullEmbedding.slice(0, dimensions) : fullEmbedding;
  }
}
```

---

## 3. Superpowers (Advanced Features)

### 3.1 🧠 Smart Language Detection & Routing
```typescript
// src/utils/Embedder/languageRouter.ts (NEW)
import { detectLanguage } from 'franc-min'; // lightweight lang detection

export async function routeEmbedding(text: string, userPreference?: EmbeddingEngine): Promise<EmbeddingProvider> {
  // Explicit user choice wins
  if (userPreference && userPreference !== 'auto') {
    return createEmbeddingProvider(userPreference);
  }

  // Auto-detect: if non-English, use multilingual
  const langCode = detectLanguage(text);
  const isEnglish = langCode === 'eng';
  
  if (!isEnglish) {
    console.log(`[LanguageRouter] Detected ${langCode} → using multilingual embedder`);
    return createEmbeddingProvider('nomic-v2-moe');
  }
  
  // English: use faster, smaller v1.5 with 8K context
  return createEmbeddingProvider('nomic-v1.5');
}
```

### 3.2 📏 Matryoshka Dimension Selector
```typescript
// User chooses embedding size per workspace
type EmbeddingDimension = 768 | 512 | 256 | 128 | 64;

interface WorkspaceEmbeddingConfig {
  engine: EmbeddingEngine;
  dimensions: EmbeddingDimension;  // Truncate for storage/speed
  autoDetectLanguage: boolean;
}

// Storage savings: 64-dim = 91% smaller vectors vs 768
// MTEB retention: 64-dim ≈ 95%, 128-dim ≈ 98%, 256-dim ≈ 99%
```

### 3.3 ☁️ Hybrid Cloud Fallback (Cactus Superpower)
```typescript
// src/utils/Embedder/hybridEmbedder.ts (NEW)
export class HybridEmbedder implements EmbeddingProvider {
  private localProvider: EmbeddingProvider;
  private cloudProvider: CloudEmbeddingProvider; // Cactus cloud API

  async embed(text: string, as: 'query' | 'embed_document'): Promise<number[]> {
    try {
      // Try local first
      return await this.localProvider.embed(text, as);
    } catch (localError) {
      // Fallback to cloud if local fails (OOM, model not downloaded, etc.)
      console.log('[HybridEmbedder] Local failed, falling back to cloud:', localError.message);
      
      if (!await this.cloudProvider.isAvailable()) {
        throw new Error('Both local and cloud embedding unavailable');
      }
      
      const cloudResult = await this.cloudProvider.embed(text, as);
      
      // Cache cloud result locally for future
      await this.cacheEmbedding(text, cloudResult);
      return cloudResult;
    }
  }
}
```

### 3.4 ⚡ Progressive Loading & Quantization Streaming
```typescript
// Download Q2_K first (261MB, fast), upgrade to Q4_K_M in background
export async function progressiveModelLoad(modelId: string): Promise<void> {
  const quantizations = ['Q2_K', 'Q4_K_S', 'Q4_K_M', 'Q5_K_M'];
  
  for (const quant of quantizations) {
    const url = getQuantizationUrl(modelId, quant);
    const path = getModelPath(modelId, quant);
    
    if (!await RNFS.exists(path)) {
      await downloadWithProgress(url, path, (progress) => {
        uiStore.setModelDownloadProgress(modelId, progress, quant);
      });
      // Swap model in-place (Cactus supports hot-swap)
      await embeddingProvider.hotSwapModel(path);
    }
  }
}
```

### 3.5 🔄 Cross-Lingual Search (Semantic Alignment)
```typescript
// Since v2-moe shares latent space across languages,
// queries in Language A find documents in Language B automatically
export async function crossLingualSearch(
  query: string, 
  queryLang: string,
  workspaceSlug: string
): Promise<SearchResult[]> {
  // Single embedding works for all languages - no translation needed!
  const queryEmbedding = await embedder.embed(query, 'query');
  
  return vectorDB.search(workspaceSlug, queryEmbedding, {
    topK: 10,
    // Optional: boost same-language results
    metadataFilter: queryLang ? { language: queryLang } : undefined,
  });
}
```

---

## 4. UI/UX Integration

### 4.1 Embedding Engine Selector (Workspace Settings)
```tsx
// src/screens/WorkspaceSettings/EmbeddingEngineSelector.tsx (NEW)
export function EmbeddingEngineSelector({ workspace }: { workspace: WorkspaceType }) {
  const { updateWorkspace } = useWorkspace();
  const [config, setConfig] = useState<WorkspaceEmbeddingConfig>(workspace.embeddingConfig);

  return (
    <SettingsSection title="Embedding Engine">
      <SelectLabel>
        <Select
          value={config.engine}
          onValueChange={(v) => updateConfig({ engine: v })}
        >
          <Select.Item value="auto">🧠 Auto (detect language)</Select.Item>
          <Select.Item value="nomic-v1.5">🇺🇸 English-only (8K ctx, 84MB)</Select.Item>
          <Select.Item value="nomic-v2-moe">🌍 Multilingual (512 ctx, 328MB)</Select.Item>
        </Select>
      </SelectLabel>

      {config.engine === 'nomic-v2-moe' && (
        <DimensionSelector
          value={config.dimensions}
          onChange={(d) => updateConfig({ dimensions: d })}
          options={[
            { value: 768, label: '768 - Best quality (328MB vectors)' },
            { value: 512, label: '512 - Balanced (66% storage)' },
            { value: 256, label: '256 - Fast search (33% storage) ⭐' },
            { value: 128, label: '128 - Mobile optimized (16% storage)' },
            { value: 64, label: '64 - Tiny (8% storage)' },
          ]}
        />
      )}

      <ToggleLabel
        title="Auto-detect document language"
        description="Automatically tag documents with detected language for filtered search"
        value={config.autoDetectLanguage}
        onChange={(v) => updateConfig({ autoDetectLanguage: v })}
      />
    </SettingsSection>
  );
}
```

### 4.2 Language Badge in Chat Citations
```tsx
// src/screens/WorkspaceChat/ChatHistory/CitationItem.tsx
export function CitationItem({ citation }: { citation: IChatCitation }) {
  const [lang, setLang] = useState<string>();
  
  useEffect(() => {
    // Detect language of cited chunk
    if (citation.document?.chunk) {
      setLang(detectLanguage(citation.document.chunk));
    }
  }, [citation]);

  return (
    <View className="flex-row items-center gap-2">
      {lang && (
        <LanguageBadge code={lang} />
      )}
      <Text>{citation.document.name}</Text>
    </View>
  );
}
```

---

## 5. Database Schema Updates

```typescript
// src/database/models/Workspace.ts (extend)
export interface WorkspaceType {
  // ... existing fields
  embeddingConfig?: {
    engine: EmbeddingEngine;
    dimensions: EmbeddingDimension;
    autoDetectLanguage: boolean;
    modelVersion: string;  // Track which quantization is active
  };
}

// src/database/models/WorkspaceChat.ts (extend citation)
export type IDocumentCitation = {
  type: 'document';
  document: {
    uuid: string;
    name: string;
    chunk: string;
    score?: number;
    language?: string;  // NEW: detected language
  }
}
```

---

## 6. Migration Strategy

### 6.1 Backward Compatibility
- Existing workspaces default to `engine: 'nomic-v1.5'`, `dimensions: 768`
- Re-embedding is **optional** - old vectors remain valid
- New documents use new config automatically

### 6.2 Re-embedding Tool (Dev Menu)
```typescript
// src/screens/Dev/ReEmbeddingTool.tsx (NEW)
export async function reEmbedWorkspace(workspaceSlug: string, newConfig: WorkspaceEmbeddingConfig) {
  const docs = await Document.find({ workspaceSlug });
  const embedder = createEmbeddingProvider(newConfig.engine);
  
  for (const doc of docs) {
    const chunks = await textSplitter.splitText(doc.content);
    const embeddings = await embedder.embedBatch(chunks, 'embed_document');
    
    // Truncate to target dimensions
    const truncated = embeddings.map(e => e.slice(0, newConfig.dimensions));
    
    await vectorDB.bulkUpdate(workspaceSlug, doc.uuid, truncated);
  }
}
```

---

## 7. Performance Benchmarks (Target)

| Metric | v1.5 (English) | v2-moe (Multi) |
|--------|---------------|----------------|
| Model Size | 84 MB | 328 MB (Q4_K_M) |
| Load Time | ~2s | ~5s |
| Embed Speed | ~50ms | ~80ms |
| Context | 8192 | 512 |
| Dimensions | 768 | 768 (truncatable) |
| Languages | 1 | ~100 |
| RAM (loaded) | ~200 MB | ~600 MB |
| Search Quality (EN) | 62.3 MTEB | 62.0 MTEB |
| Search Quality (Multi) | N/A | 65.8 MIRACL |

---

## 8. Implementation Checklist

### Phase 1: Core (Week 1)
- [ ] Add `MULTILINGUAL_EMBEDDING_MODEL` to defaults.ts
- [ ] Create `MultilingualEmbedderProvider` class
- [ ] Create `EmbeddingProvider` interface & factory
- [ ] Update `OnDeviceEmbedderProvider` to implement interface
- [ ] Add model download to `ModelStore` (reuse downloadManager)

### Phase 2: Smart Features (Week 2)
- [ ] Language detection + auto-routing
- [ ] Matryoshka dimension truncation
- [ ] Hybrid cloud fallback (Cactus API)
- [ ] Progressive quantization loading

### Phase 3: UI & Integration (Week 3)
- [ ] Workspace embedding settings screen
- [ ] Language badges in citations
- [ ] Cross-lingual search demo
- [ ] Re-embedding tool in Dev menu

### Phase 4: Polish (Week 4)
- [ ] Benchmarks & memory profiling
- [ ] Migration guide for existing users
- [ ] Documentation updates
- [ ] Test on low-end devices (Q2_K fallback)

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| 328MB download too large for some users | Offer Q2_K (261MB) as "Lite" option; progressive loading |
| 512 token context limits chunk size | Auto-adjust TextSplitter chunk size to 400 tokens |
| Higher RAM usage (600MB) | Auto-unload after 3min idle; warn on low-memory devices |
| MoE slower than dense | Benchmark: only ~60% slower, acceptable for embeddings |
| Breaking existing vector indices | Keep v1.5 as default; opt-in only; vectors compatible across dimensions |

---

## 10. Future Superpowers (v2)

1. **🔀 Dynamic Quantization Switching** - Swap Q2_K ↔ Q4_K_M based on battery/thermal state
2. **📊 Embedding Analytics Dashboard** - Visualize language distribution, coverage gaps
3. **🎯 Task-Specific Prefixes** - Auto-select `classification:` vs `clustering:` vs `search_*` prefix
4. **🌐 Federated Embeddings** - Merge local + cloud indices seamlessly
5. **🧬 Custom Fine-tuning** - On-device LoRA for domain adaptation (legal, medical, code)

---

*Spec Version: 1.0 | Author: AnythingLLM Mobile Team | Date: 2026*