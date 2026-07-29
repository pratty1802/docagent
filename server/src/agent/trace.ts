import { randomUUID } from "node:crypto";
import type { AgentTraceStep } from "../types.js";

export function createTraceStep(
  node: string,
  status: AgentTraceStep["status"],
  detail: string,
): AgentTraceStep {
  return {
    id: randomUUID(),
    node,
    status,
    detail,
    at: new Date().toISOString(),
  };
}
