/**
 * Structured logging with Pino.
 *
 * LEARNING: JSON logs in production make it easy to search traces by request ID.
 * Never log secrets (API keys, service role keys). See LEARNING.md § Observability.
 */
import pino from "pino";
import { getConfig } from "../config.js";

export const logger = pino({
  level: getConfig().NODE_ENV === "production" ? "info" : "debug",
  transport:
    getConfig().NODE_ENV === "development"
      ? { target: "pino/file", options: { destination: 1 } }
      : undefined,
});
