import {
  generateDocx,
  generateXlsx,
  generatePptx,
  shareDocument,
} from "@/utils/DocGen/DocGenerator";

jest.mock("@dr.pogodin/react-native-fs", () => ({
  DocumentDirectoryPath: "/mock/documents",
  writeFile: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  exists: jest.fn().mockResolvedValue(false),
}));

jest.mock("docx", () => {
  const mockPacker = {
    toBase64String: jest.fn().mockResolvedValue("base64encodedstring"),
  };
  return {
    Document: jest.fn().mockImplementation(() => ({})),
    Packer: mockPacker,
    Paragraph: jest.fn().mockImplementation(() => ({})),
    TextRun: jest.fn().mockImplementation(() => ({})),
    HeadingLevel: { HEADING_1: "HEADING_1" },
  };
});

jest.mock("xlsx", () => ({
  utils: {
    book_new: jest.fn().mockReturnValue({}),
    aoa_to_sheet: jest.fn().mockReturnValue({}),
    book_append_sheet: jest.fn(),
  },
  write: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3])),
}));

jest.mock("pptxgenjs", () => {
  const mockSlide = {
    addText: jest.fn(),
  };
  const mockPptx = {
    title: "",
    addSlide: jest.fn().mockReturnValue(mockSlide),
    writeFile: jest.fn().mockResolvedValue(undefined),
  };
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockPptx),
  };
});

describe("DocGenerator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("generateDocx", () => {
    it("should generate a DOCX file and return URI", async () => {
      const uri = await generateDocx({
        title: "Test Document",
        content: ["Hello World", "This is a test"],
      });

      expect(uri).toContain(".docx");
      expect(uri).toContain("Test Document");
    });

    it("should handle empty content array", async () => {
      const uri = await generateDocx({
        title: "Empty Doc",
        content: [],
      });

      expect(uri).toContain(".docx");
    });
  });

  describe("generateXlsx", () => {
    it("should generate an XLSX file and return URI", async () => {
      const uri = await generateXlsx({
        title: "Test Spreadsheet",
        headers: ["Name", "Value"],
        rows: [
          ["Row1", 100],
          ["Row2", 200],
        ],
      });

      expect(uri).toContain(".xlsx");
      expect(uri).toContain("Test Spreadsheet");
    });

    it("should handle empty rows", async () => {
      const uri = await generateXlsx({
        title: "Empty Sheet",
        headers: ["Col1"],
        rows: [],
      });

      expect(uri).toContain(".xlsx");
    });
  });

  describe("generatePptx", () => {
    it("should generate a PPTX file and return URI", async () => {
      const uri = await generatePptx({
        title: "Test Presentation",
        slides: [
          { title: "Slide 1", content: ["Point 1", "Point 2"] },
          { title: "Slide 2", content: ["Point 3"] },
        ],
      });

      expect(uri).toContain(".pptx");
      expect(uri).toContain("Test Presentation");
    });

    it("should handle single slide", async () => {
      const uri = await generatePptx({
        title: "Single Slide",
        slides: [{ title: "Only Slide", content: ["Content"] }],
      });

      expect(uri).toContain(".pptx");
    });
  });

  describe("shareDocument", () => {
    it("should call Share.share with correct mime type for docx", async () => {
      const mockShare = jest.fn().mockResolvedValue(undefined);
      jest.mock("react-native", () => ({
        Share: { share: mockShare },
      }));

      await shareDocument("/mock/documents/test.docx");

      expect(mockShare).toHaveBeenCalledWith({
        url: "/mock/documents/test.docx",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
    });
  });
});
