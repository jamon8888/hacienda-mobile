# UI Brainstorm — Document & Folder Ingestion + Transcription

> **Date**: 2026-08-02
> **Status**: Brainstorm

---

## Xberg Transcription Capabilities

### Supported Formats

| MIME Type    | Extensions      | Notes                    |
| ------------ | --------------- | ------------------------ |
| `audio/mpeg` | `.mp3`, `.mpga` | MP3                      |
| `audio/mp4`  | `.m4a`          | M4A / AAC in MP4         |
| `audio/wav`  | `.wav`          | WAV / RIFF               |
| `audio/webm` | `.webm`         | WebM audio               |
| `video/mp4`  | `.mp4`, `.mpeg` | Video (audio track only) |
| `video/webm` | `.webm`         | Video (audio track only) |

### Model Sizes

| Variant     | Cache Size | RAM Usage | Best For                 |
| ----------- | ---------- | --------- | ------------------------ |
| **Tiny**    | ~10 MB     | Low       | Mobile (default)         |
| **Base**    | ~50 MB     | Low       | Mobile (better accuracy) |
| **Small**   | ~200 MB    | Medium    | Tablet                   |
| **Medium**  | ~500 MB    | High      | Desktop                  |
| **LargeV3** | ~1.5 GB    | Very High | Server                   |

### Configuration

```typescript
interface TranscriptionConfig {
  enabled: boolean;
  model: "tiny" | "base" | "small" | "medium" | "large-v3";
  language?: string; // ISO-639-1 code
  timestamps?: boolean;
  maxBytes?: number; // Default: 512MB
  maxDurationMs?: number; // Default: 30 min
}
```

### Mobile Recommendation

- **Default model**: `tiny` (10MB, fastest)
- **Optional upgrade**: `base` (50MB, better accuracy)
- **Max audio**: 30 minutes (configurable)
- **Offline**: Yes, models download on first use then cached

---

## UI Design — Document Ingestion

### Current State

- Single file picker via paperclip button
- Limited to `.pdf`, `.txt`, `.markdown`
- Max 4 attachments per chat
- No folder support

### Proposed: Two-Mode Ingestion

#### Mode 1: Quick Attach (Chat Context)

**Location**: Existing paperclip button in PromptInput
**Purpose**: Attach files to current chat message
**Changes**:

- Add multi-file selection
- Expand file types (add `.docx`, `.pptx`, `.xlsx`, `.mp3`, `.wav`)
- Show file type icons
- Keep max 4 for quick attach

#### Mode 2: Workspace Import (Permanent)

**Location**: New "Documents" section in WorkspaceSettings
**Purpose**: Import files permanently into workspace
**Changes**:

- Full folder picker
- Unlimited files
- Progress tracking
- File management (view, delete)

---

## UI Components — Workspace Import

### Entry Point: WorkspaceSettings

**Add to Main Settings**:

```
┌─────────────────────────────────────────┐
│  Workspace Settings                     │
├─────────────────────────────────────────┤
│  Name                    >              │
│  System Prompt           >              │
│  Temperature             >              │
│  Context Length          >              │
│  Embedding               >              │
│  Documents               >    ← NEW    │
└─────────────────────────────────────────┘
```

**Documents Row**:

```tsx
<TouchableOpacity
  style={{ backgroundColor: "#27282A", padding: 14, gap: 20 }}
  className="w-full flex flex-row items-center rounded-lg">
  <View className="flex flex-row gap-2 items-center">
    <Files size={18} color="#FFF" />
    <Text className="text-white text-lg">Documents</Text>
  </View>
  <View className="flex flex-1 flex-row gap-2 items-center justify-between">
    <Text style={{ color: "#9F9FA0" }} className="text-lg flex-1 text-right">
      {documentCount} files
    </Text>
    <CaretRight size={18} color="#FFF" />
  </View>
</TouchableOpacity>
```

---

### Document Import Screen

**Layout**:

```
┌─────────────────────────────────────────┐
│  ← Back        Documents        ⋮      │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  📁 Import from folder          │   │
│  │  Select a folder to import      │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  📄 Import files                │   │
│  │  Select individual files        │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ── Imported Files (12) ─────────────  │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ 📄 report.pdf           2.4 MB  │   │
│  │    PDF • 156 chunks • 3m ago    │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │ 📄 notes.docx           156 KB  │   │
│  │    DOCX • 24 chunks • 5m ago    │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │ 🎵 interview.mp3        45 MB   │   │
│  │    MP3 • Transcribed • 10m ago  │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

**Components**:

```
src/screens/WorkspaceSettings/DocumentImport/
├── index.tsx                    # Main screen
├── ImportActions.tsx            # Folder/File import buttons
├── ImportedFilesList.tsx        # List of imported files
├── FileItem.tsx                 # Single file row
├── ImportProgressModal.tsx      # Progress overlay
├── TranscriptionOptions.tsx     # Audio transcription settings
└── hooks/
    ├── useDocumentImport.ts     # Import logic
    └── useImportProgress.ts     # Progress tracking
```

---

### Folder Picker

**Android**: Use `react-native-document-picker` with `type: 'folder'` (Android only)
**iOS**: Use `UIDocumentPickerViewController` with directory mode

**UI Flow**:

```
1. User taps "Import from folder"
2. Native folder picker opens
3. User selects folder
4. App scans folder for supported files
5. Shows file list with checkboxes
6. User confirms import
7. Progress modal appears
```

**Folder Scan Results**:

```typescript
interface FolderScanResult {
  folderPath: string;
  files: Array<{
    path: string;
    name: string;
    size: number;
    mimeType: string;
    supported: boolean; // Can Xberg process this?
  }>;
  totalSize: number;
  supportedCount: number;
  unsupportedCount: number;
}
```

**UI for Scan Results**:

```
┌─────────────────────────────────────────┐
│  📁 My Documents                        │
├─────────────────────────────────────────┤
│  Found 15 files (12 supported)          │
│                                         │
│  ☑️ report.pdf              2.4 MB     │
│  ☑️ notes.docx              156 KB     │
│  ☑️ presentation.pptx       1.2 MB     │
│  ☑️ interview.mp3           45 MB      │
│  ☐ image.jpg                3.2 MB     │
│    └─ ⚠️ Will be OCR'd                │
│  ☑️ data.xlsx               890 KB     │
│  ...                                   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  Total: 49.6 MB • 12 files     │   │
│  │  [Cancel]        [Import All]   │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

---

### Import Progress Modal

**Full-screen overlay during import**:

```
┌─────────────────────────────────────────┐
│                                         │
│         Importing Documents...          │
│                                         │
│    ┌─────────────────────────────┐     │
│    │  ████████████░░░░░░░  65%   │     │
│    └─────────────────────────────┘     │
│                                         │
│    Processing: interview.mp3            │
│    Transcribing audio...                │
│                                         │
│    ✓ report.pdf                         │
│    ✓ notes.docx                         │
│    ✓ presentation.pptx                  │
│    ⏳ interview.mp3                     │
│    ○ data.xlsx                          │
│                                         │
│    [Cancel]                             │
│                                         │
└─────────────────────────────────────────┘
```

**Progress States**:

```typescript
interface ImportProgress {
  status:
    | "preparing"
    | "processing"
    | "embedding"
    | "storing"
    | "completed"
    | "error";
  totalFiles: number;
  processedFiles: number;
  currentFile: string;
  currentFileProgress: number; // 0-100
  errors: Array<{ file: string; error: string }>;
}
```

---

### Transcription Options Modal

**Shown when importing audio files**:

```
┌─────────────────────────────────────────┐
│  🎵 Audio Transcription                 │
├─────────────────────────────────────────┤
│                                         │
│  Detected 2 audio files:               │
│  • interview.mp3 (45 MB, 32 min)       │
│  • meeting.wav (12 MB, 8 min)          │
│                                         │
│  Model Size:                            │
│  ┌─────────────────────────────────┐   │
│  │ ○ Tiny (10 MB, fastest)         │   │
│  │ ● Base (50 MB, recommended)     │   │
│  │ ○ Small (200 MB, best accuracy) │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Language:                              │
│  ┌─────────────────────────────────┐   │
│  │ English                       ▾ │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ [Cancel]    [Transcribe & Import]│  │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

---

## UI Components — Quick Attach (Enhanced)

### Enhanced Attachment Button

**Current**: Single file picker
**Proposed**: Multi-file picker with type selection

**Long-press menu**:

```
┌─────────────────────────────┐
│  📄 Document                │
│  📁 Folder                  │
│  🎵 Audio                   │
│  📷 Image (OCR)             │
└─────────────────────────────┘
```

### Enhanced Attachment Chips

**Current**: Text only
**Proposed**: Icon + text + type indicator

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ 📄 report.pdf│ │ 🎵 audio.mp3 │ │ 📄 notes.docx│
│      ✕       │ │      ✕       │ │      ✕       │
└──────────────┘ └──────────────┘ └──────────────┘
```

**Type Colors**:

- PDF: `#F97066` (red)
- DOCX: `#3B82F6` (blue)
- Audio: `#6ce9a6` (green)
- Image: `#F59E0B` (yellow)
- Other: `#9F9FA0` (gray)

---

## File Type Expansion

### Currently Supported

- `.pdf` - PDF documents
- `.txt` - Plain text
- `.markdown` - Markdown

### Proposed (with Xberg)

| Category      | Types                                                                             | OCR Required  |
| ------------- | --------------------------------------------------------------------------------- | ------------- |
| **Documents** | `.pdf`, `.docx`, `.doc`, `.pptx`, `.ppt`, `.xlsx`, `.xls`, `.odt`, `.ods`, `.odp` | No            |
| **Text**      | `.txt`, `.md`, `.markdown`, `.rst`, `.org`, `.rtf`                                | No            |
| **Data**      | `.csv`, `.tsv`, `.json`, `.yaml`, `.xml`                                          | No            |
| **Web**       | `.html`, `.htm`                                                                   | No            |
| **Email**     | `.eml`, `.msg`                                                                    | No            |
| **Audio**     | `.mp3`, `.m4a`, `.wav`, `.webm`                                                   | Transcription |
| **Video**     | `.mp4`, `.mpeg`, `.webm`                                                          | Transcription |
| **Images**    | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.tiff`                         | OCR           |
| **Code**      | `.js`, `.ts`, `.py`, `.java`, `.c`, `.cpp`, `.go`, `.rs`                          | No            |

---

## Bottom Sheet: Quick Import

**Alternative to full screen**: Bottom sheet for quick imports

```
┌─────────────────────────────────────────┐
│  ─────────                              │
│                                         │
│  Import to Workspace                    │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  📄 Import Files                │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │  📁 Import Folder               │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │  🎵 Import Audio                │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │  📷 Scan with Camera (OCR)      │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Recent:                                │
│  📄 report.pdf • 2m ago                │
│  🎵 meeting.mp3 • 5m ago               │
│                                         │
└─────────────────────────────────────────┘
```

---

## Settings: Document Configuration

**Add to WorkspaceSettings**:

```
┌─────────────────────────────────────────┐
│  ← Back       Documents Settings        │
├─────────────────────────────────────────┤
│                                         │
│  EXTRACTION                             │
│                                         │
│  OCR Engine                  Tesseract ▾│
│  OCR Language                English   ▾│
│  Extract Tables              ●         │
│  Code Intelligence           ●         │
│                                         │
│  CHUNKING                               │
│                                         │
│  Strategy                Semantic      ▾│
│  Max Chunk Size              512       ▾│
│  Chunk Overlap                50         │
│                                         │
│  TRANSCRIPTION (Audio)                  │
│                                         │
│  Default Model                Tiny     ▾│
│  Auto-Transcribe             ●         │
│  Max Duration              30 min      ▾│
│                                         │
│  STORAGE                                │
│                                         │
│  Total Size                 45.2 MB      │
│  Total Files                    12       │
│  Total Vectors              1,247       │
│                                         │
│  [Clear All Documents]                  │
│                                         │
└─────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Basic Import (Week 1)

- [ ] Add Documents page to WorkspaceSettings
- [ ] Implement single file import with Xberg
- [ ] Show imported files list
- [ ] Basic progress indicator

### Phase 2: Folder Import (Week 2)

- [ ] Add folder picker (Android + iOS)
- [ ] Implement folder scanning
- [ ] File selection UI with checkboxes
- [ ] Batch import with progress

### Phase 3: Transcription (Week 3)

- [ ] Add audio file detection
- [ ] Transcription options modal
- [ ] Whisper model download progress
- [ ] Transcription progress

### Phase 4: Enhanced Quick Attach (Week 4)

- [ ] Multi-file selection
- [ ] File type icons
- [ ] Long-press menu for type selection
- [ ] Enhanced attachment chips

### Phase 5: Polish (Week 5)

- [ ] Error handling
- [ ] Offline support verification
- [ ] Performance optimization
- [ ] UI/UX refinements

---

## Technical Notes

### Folder Picker Limitations

| Platform | Native Folder Picker              | Workaround                                             |
| -------- | --------------------------------- | ------------------------------------------------------ |
| Android  | ✅ `react-native-document-picker` | None needed                                            |
| iOS      | ⚠️ Limited                        | Use `UIDocumentPickerViewController` via native module |

### File Type Detection

```typescript
const SUPPORTED_TYPES = {
  document: [
    ".pdf",
    ".docx",
    ".doc",
    ".pptx",
    ".ppt",
    ".xlsx",
    ".xls",
    ".odt",
    ".ods",
    ".odp",
  ],
  text: [".txt", ".md", ".markdown", ".rst", ".org", ".rtf"],
  data: [".csv", ".tsv", ".json", ".yaml", ".xml"],
  web: [".html", ".htm"],
  email: [".eml", ".msg"],
  audio: [".mp3", ".m4a", ".wav", ".webm"],
  video: [".mp4", ".mpeg", ".webm"],
  image: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff"],
  code: [".js", ".ts", ".py", ".java", ".c", ".cpp", ".go", ".rs"],
};
```

### Transcription Model Download

```typescript
// First-use download with progress
const downloadProgress = {
  tiny: { size: 10, unit: "MB" },
  base: { size: 50, unit: "MB" },
  small: { size: 200, unit: "MB" },
};

// Show download progress in UI
onProgress: (downloaded, total) => {
  setDownloadProgress((downloaded / total) * 100);
};
```

---

## Open Questions

1. **Folder picker on iOS**: Should we implement native module or use alternative approach?
2. **Max files per import**: Should there be a limit? (e.g., 100 files)
3. **Auto-transcribe**: Should audio be transcribed automatically or require explicit action?
4. **Model selection**: Should users choose Whisper model size or auto-select based on device?
5. **Camera scan**: Should we add camera-based OCR for physical documents?
6. **Cloud sync**: Should imported documents sync across devices?
