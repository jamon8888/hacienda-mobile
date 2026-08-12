import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import * as XLSX from "xlsx";
import PptxGenJS from "pptxgenjs";
import {
  DocumentDirectoryPath,
  writeFile,
  mkdir,
  exists,
} from "@dr.pogodin/react-native-fs";

interface DocxConfig {
  title: string;
  content: string[];
}

interface XlsxConfig {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

interface PptxConfig {
  title: string;
  slides: { title: string; content: string[] }[];
}

const DOC_GEN_FOLDER = `${DocumentDirectoryPath}/docgen`;

async function ensureDocGenFolder() {
  if (!(await exists(DOC_GEN_FOLDER))) {
    await mkdir(DOC_GEN_FOLDER);
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return global.btoa(binary);
}

export async function generateDocx(config: DocxConfig): Promise<string> {
  await ensureDocGenFolder();

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: config.title,
            heading: HeadingLevel.HEADING_1,
          }),
          ...config.content.map(
            text =>
              new Paragraph({
                children: [new TextRun(text)],
              }),
          ),
        ],
      },
    ],
  });

  const base64 = await Packer.toBase64String(doc);
  const uri = `${DOC_GEN_FOLDER}/${config.title}.docx`;
  await writeFile(uri, base64, "base64");
  return uri;
}

export async function generateXlsx(config: XlsxConfig): Promise<string> {
  await ensureDocGenFolder();

  const wb = XLSX.utils.book_new();
  const wsData = [config.headers, ...config.rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, config.title);

  const wbBytes = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const base64 = uint8ArrayToBase64(wbBytes);
  const uri = `${DOC_GEN_FOLDER}/${config.title}.xlsx`;
  await writeFile(uri, base64, "base64");
  return uri;
}

export async function generatePptx(config: PptxConfig): Promise<string> {
  await ensureDocGenFolder();

  const pptx = new PptxGenJS();
  pptx.title = config.title;

  for (const slide of config.slides) {
    const s = pptx.addSlide();
    s.addText(slide.title, {
      x: 1,
      y: 1,
      w: 8,
      h: 1,
      fontSize: 32,
      bold: true,
    });

    let y = 2.5;
    for (const text of slide.content) {
      s.addText(text, { x: 1, y, w: 8, h: 0.5, fontSize: 18 });
      y += 0.6;
    }
  }

  const uri = `${DOC_GEN_FOLDER}/${config.title}.pptx`;
  await pptx.writeFile({ fileName: uri });
  return uri;
}

function getMimeType(uri: string): string {
  if (uri.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (uri.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (uri.endsWith(".pptx")) {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  return "application/octet-stream";
}

export async function shareDocument(uri: string): Promise<void> {
  const { Share } = require("react-native");
  await Share.share({
    url: uri,
    type: getMimeType(uri),
  });
}
