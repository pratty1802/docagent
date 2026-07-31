/**
 * LangGraph compilation — agent orchestration graph.
 *
 * LEARNING: Nodes + conditional edges = explicit control flow vs opaque chains.
 * Flow: input_guard → agent (retrieve+generate) → critique → END (or retry agent).
 * See LEARNING.md § LangGraph flow.
 */
import { END, START, StateGraph } from "@langchain/langgraph";
import { getConfig } from "../config.js";
import { AgentState, type AgentStateType } from "./state.js";
import { inputGuardNode } from "./nodes/inputGuard.js";
import { agentNode } from "./nodes/agent.js";
import { critiqueNode } from "./nodes/critique.js";

function routeAfterInputGuard(state: AgentStateType): "agent" | typeof END {
  return state.blocked ? END : "agent";
}

function routeAfterAgent(state: AgentStateType): "critique" | typeof END {
  if (state.readyForCritique || state.draftAnswer) {
    return "critique";
  }
  return END;
}

function routeAfterCritique(state: AgentStateType): "agent" | typeof END {
  const { MAX_CRITIQUE_RETRIES } = getConfig();
  if (!state.grade?.grounded && state.critiqueIterations < MAX_CRITIQUE_RETRIES) {
    return "agent";
  }
  return END;
}

export function createAgentGraph() {
  const graph = new StateGraph(AgentState)
    .addNode("input_guard", inputGuardNode)
    .addNode("agent", agentNode)
    .addNode("critique", critiqueNode)
    .addEdge(START, "input_guard")
    .addConditionalEdges("input_guard", routeAfterInputGuard, {
      agent: "agent",
      [END]: END,
    })
    .addConditionalEdges("agent", routeAfterAgent, {
      critique: "critique",
      [END]: END,
    })
    .addConditionalEdges("critique", routeAfterCritique, {
      agent: "agent",
      [END]: END,
    });

  return graph.compile();
}
