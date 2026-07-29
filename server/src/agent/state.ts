/**
 * LangGraph state definition.
 *
 * LEARNING: Annotation reducers define how node outputs merge into shared state.
 * See LEARNING.md § LangGraph state.
 */
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import type { AgentTraceStep, Citation, GroundednessGrade } from "../types.js";

export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  question: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  documentIds: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  citations: Annotation<Citation[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  draftAnswer: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  grade: Annotation<GroundednessGrade | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  toolIterations: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 0,
  }),
  critiqueIterations: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 0,
  }),
  blocked: Annotation<boolean>({
    reducer: (_left, right) => right,
    default: () => false,
  }),
  blockReason: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  trace: Annotation<AgentTraceStep[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  readyForCritique: Annotation<boolean>({
    reducer: (_left, right) => right,
    default: () => false,
  }),
});

export type AgentStateType = typeof AgentState.State;
