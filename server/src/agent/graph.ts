/**
 * LangGraph compilation — agent orchestration graph.
 *
 * LEARNING: Nodes + conditional edges = explicit control flow vs opaque chains.
 * See LEARNING.md § LangGraph flow.
 */
import { END, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { getConfig } from "../config.js";
import { AgentState, type AgentStateType } from "./state.js";
import { allTools } from "./tools/index.js";
import { inputGuardNode } from "./nodes/inputGuard.js";
import { agentNode } from "./nodes/agent.js";
import { critiqueNode } from "./nodes/critique.js";

const toolNode = new ToolNode(allTools);

function routeAfterInputGuard(state: AgentStateType): "agent" | typeof END {
  return state.blocked ? END : "agent";
}

function routeAfterAgent(state: AgentStateType): "tools" | "critique" | typeof END {
  const { MAX_AGENT_ITERATIONS } = getConfig();
  const lastMessage = state.messages[state.messages.length - 1];
  const hasToolCalls =
    lastMessage &&
    "tool_calls" in lastMessage &&
    Array.isArray(lastMessage.tool_calls) &&
    lastMessage.tool_calls.length > 0;

  if (hasToolCalls && state.toolIterations <= MAX_AGENT_ITERATIONS) {
    return "tools";
  }

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
    .addNode("tools", toolNode)
    .addNode("critique", critiqueNode)
    .addEdge(START, "input_guard")
    .addConditionalEdges("input_guard", routeAfterInputGuard, {
      agent: "agent",
      [END]: END,
    })
    .addConditionalEdges("agent", routeAfterAgent, {
      tools: "tools",
      critique: "critique",
      [END]: END,
    })
    .addEdge("tools", "agent")
    .addConditionalEdges("critique", routeAfterCritique, {
      agent: "agent",
      [END]: END,
    });

  return graph.compile();
}
