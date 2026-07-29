import { Router } from "express";
import multer from "multer";
import { getConfig } from "../config.js";
import { validatePdfUpload } from "../guardrails/upload.js";
import { ingestPdf } from "../rag/ingest.js";
import { deleteDocument, listDocuments } from "../rag/store.js";
import { AppError } from "../lib/errors.js";
import { createUploadRateLimiter } from "../middleware/rateLimit.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getConfig().MAX_UPLOAD_MB * 1024 * 1024 },
});

export const documentsRouter = Router();

documentsRouter.get("/", async (_req, res, next) => {
  try {
    const documents = await listDocuments();
    res.json({ documents });
  } catch (err) {
    next(err);
  }
});

documentsRouter.post(
  "/",
  createUploadRateLimiter(),
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new AppError("No file uploaded. Use field name 'file'.", 400, "NO_FILE");
      }

      const filename = validatePdfUpload(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname,
      );

      const result = await ingestPdf(req.file.buffer, filename);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

documentsRouter.delete("/:id", async (req, res, next) => {
  try {
    await deleteDocument(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
