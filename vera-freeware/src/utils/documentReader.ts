// Document Drop & Query — client-side text extraction (100% local).
// Plaintext formats read directly; PDFs parse via pdfjs-dist with a
// locally-bundled worker (no CDN — offline-first hard requirement).

import * as pdfjsLib from "pdfjs-dist";
// Vite bundles the worker from the installed package (no network fetch).
// @ts-ignore - Vite ?url import of the pdf.js worker entry
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerSrc;

export const SUPPORTED_EXTENSIONS = ["txt", "md", "markdown", "csv", "json", "pdf"] as const;

// ~6k chars ≈ 1.5k tokens: safe slice of a 4k model window alongside
// history + system prompt. Caller truncates; we never silently drop.
export const MAX_DOC_CHARS = 6000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB guard

export interface DocContext {
  fileName: string;
  charCount: number;
  truncated: boolean;
  text: string;
}

export function isSupportedFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext);
}

async function extractPdf(buffer: ArrayBuffer): Promise<string> {
  const pdf = await (pdfjsLib as any).getDocument({ data: buffer }).promise;
  const parts: string[] = [];
  const pages = Math.min(pdf.numPages, 50); // sanity cap
  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = (content.items as Array<{ str?: string }>).map((it) => it.str ?? "");
    parts.push(strings.join(" "));
  }
  await pdf.destroy();
  return parts.join("\n\n");
}

export async function extractFileText(file: File): Promise<DocContext> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`File is ${(file.size / 1048576).toFixed(1)} MB — 10 MB limit.`);
  }
  if (!isSupportedFile(file.name)) {
    throw new Error(`.${file.name.split(".").pop()} not supported — drop .txt, .md, .csv, .json or .pdf.`);
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  let text: string;
  if (ext === "pdf") {
    text = await extractPdf(await file.arrayBuffer());
  } else {
    text = await file.text();
  }
  text = text.replace(/\s+\n/g, "\n").trim();
  if (!text) throw new Error("No extractable text found in this file.");
  const truncated = text.length > MAX_DOC_CHARS;
  return {
    fileName: file.name,
    charCount: text.length,
    truncated,
    text: truncated ? text.slice(0, MAX_DOC_CHARS) : text,
  };
}

/** Wraps doc text as a model context block for prompt injection. */
export function docContextBlock(doc: DocContext): string {
  return (
    `--- ATTACHED DOCUMENT: ${doc.fileName} (${doc.charCount} chars` +
    `${doc.truncated ? `, truncated to ${MAX_DOC_CHARS}` : ""}) ---\n` +
    doc.text +
    `\n--- END DOCUMENT ---\n` +
    `Answer questions using this document first; say plainly when the answer is not in it.`
  );
}
