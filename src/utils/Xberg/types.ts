export interface ExtractionConfig {
  outputFormat?: 'text' | 'markdown' | 'html' | 'json';
  forceOcr?: boolean;
  ocr?: {
    backend: 'tesseract';
    language?: string;
    autoRotate?: boolean;
  };
  chunking?: {
    enabled: boolean;
    strategy?: 'semantic' | 'text' | 'markdown';
    maxChunkSize?: number;
    chunkOverlap?: number;
  };
  tableExtraction?: boolean;
  codeIntelligence?: boolean;
  batch?: {
    use_cache?: boolean;
    max_concurrent_extractions?: number;
  };
}

export interface ExtractionResult {
  results: Array<{
    content: string;
    metadata: {
      format: string;
      mimeType: string;
      size: number;
      pages?: number;
      language?: string;
      title?: string;
      author?: string;
    };
    tables?: Array<{ rows: string[][]; header?: string[] }>;
    chunks?: Array<{
      content: string;
      chunkType: string;
      embedding?: number[];
      metadata: { index: number; tokenCount: number };
    }>;
  }>;
  errors?: Array<{ source?: string; error?: string; code?: string }>;
  summary?: Record<string, unknown>;
}

export interface SupportedFormat {
  extension: string;
  mimeType: string;
}

export interface TranscriptionConfig {
  model: 'tiny' | 'base' | 'small' | 'medium' | 'large-v3';
  language?: string;
  timestamps?: boolean;
}

export const SUPPORTED_FILE_TYPES = {
  document: ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.xls', '.odt', '.ods', '.odp'],
  text: ['.txt', '.md', '.markdown', '.rst', '.org', '.rtf'],
  data: ['.csv', '.tsv', '.json', '.yaml', '.xml'],
  web: ['.html', '.htm'],
  email: ['.eml', '.msg'],
  audio: ['.mp3', '.m4a', '.wav', '.webm', '.mpga'],
  video: ['.mp4', '.mpeg', '.webm'],
  image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff'],
  code: ['.js', '.ts', '.py', '.java', '.c', '.cpp', '.go', '.rs'],
};

export const DOCUMENT_PICKER_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
  'text/csv',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/webm',
];
