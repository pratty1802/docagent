/**
 * Upload guardrails for PDF files.
 *
 * LEARNING: Validate MIME type AND magic bytes — attackers can spoof Content-Type.
 * See LEARNING.md § Upload guardrails.
 */
import { getConfig } from "../config.js";
import { AppError } from "../lib/errors.js";

const PDF_MAGIC = "%PDF";

export function sanitizeFilename(filename: string): string {
  const base = filename.replace(/[/\\]/g, "").replace(/[^\w.\-() ]/g, "_").trim();
  return base.slice(0, 200) || "document.pdf";
}

export function validatePdfUpload(buffer: Buffer, mimetype: string, filename: string): string {
  const { MAX_UPLOAD_MB } = getConfig();
  const maxBytes = MAX_UPLOAD_MB * 1024 * 1024;

  if (buffer.length === 0) {
    throw new AppError("Uploaded file is empty", 400, "EMPTY_FILE");
  }

  if (buffer.length > maxBytes) {
    throw new AppError(`File exceeds ${MAX_UPLOAD_MB}MB limit`, 413, "FILE_TOO_LARGE");
  }

  if (mimetype !== "application/pdf") {
    throw new AppError("Only PDF files are supported", 400, "UNSUPPORTED_TYPE");
  }

  const header = buffer.subarray(0, 4).toString("utf8");
  if (!header.startsWith(PDF_MAGIC)) {
    throw new AppError("File does not appear to be a valid PDF", 400, "INVALID_PDF");
  }

  return sanitizeFilename(filename);
}

export function validateDocumentLimits(pageCount: number, chunkCount: number): void {
  const { MAX_PAGES_PER_DOC, MAX_CHUNKS_PER_DOC } = getConfig();

  if (pageCount > MAX_PAGES_PER_DOC) {
    throw new AppError(
      `Document exceeds maximum of ${MAX_PAGES_PER_DOC} pages`,
      422,
      "TOO_MANY_PAGES",
    );
  }

  if (chunkCount > MAX_CHUNKS_PER_DOC) {
    throw new AppError(
      `Document exceeds maximum of ${MAX_CHUNKS_PER_DOC} chunks`,
      422,
      "TOO_MANY_CHUNKS",
    );
  }
}
