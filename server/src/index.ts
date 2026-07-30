import { createServer } from "node:http";
import { getConfig } from "./config.js";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";

const app = createApp();
const server = createServer(app);
const { PORT, GEMINI_CHAT_MODEL, GEMINI_EMBED_MODEL } = getConfig();

server.listen(PORT, () => {
  logger.info(
    { port: PORT, chatModel: GEMINI_CHAT_MODEL, embedModel: GEMINI_EMBED_MODEL },
    "DocAgent server listening",
  );
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    logger.error(
      { port: PORT },
      `Port ${PORT} is already in use. Stop the other process (lsof -i :${PORT}) or change PORT in .env`,
    );
    process.exit(1);
  }
  throw err;
});

function shutdown(signal: string) {
  logger.info({ signal }, "Graceful shutdown");
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
