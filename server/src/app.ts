/**
 * Express application bootstrap.
 *
 * LEARNING: Middleware order matters — security headers and CORS before routes,
 * error handler last. See LEARNING.md § Express stack.
 */
import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { Request } from "express";
import { pinoHttp } from "pino-http";
import { getCorsOrigins } from "./config.js";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { healthRouter } from "./routes/health.js";
import { documentsRouter } from "./routes/documents.js";
import { chatRouter } from "./routes/chat.js";

export function createApp() {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(
    pinoHttp({
      logger,
      customProps: (req: Request) => ({ requestId: req.requestId }),
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: getCorsOrigins() }));
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", healthRouter);
  app.use("/api/documents", documentsRouter);
  app.use("/api/chat", chatRouter);

  app.use(errorHandler);
  return app;
}
