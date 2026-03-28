/**
 * Typed WebSocket message contracts.
 *
 * Each interface maps 1-to-1 to a `ws_manager.broadcast(...)` call in
 * `backend/app/services/orchestrator.py`.  Keeping them in a single
 * discriminated union lets TypeScript narrow the type inside a
 * `switch (msg.type)` block automatically.
 */

// ─── Individual event shapes ──────────────────────────────────────────

export interface WsExecutionStarted {
  type: "execution_started";
  taskId: string;
  agentId: string;
  agentName: string;
}

export interface WsStep {
  type: "step";
  stepType: string;
  agentId: string;
  agentName: string;
  content: string;
}

export interface WsDelegation {
  type: "delegation";
  fromAgentId: string;
  fromAgent: string;
  toAgentId: string;
  toAgent: string;
  subtaskTitle: string;
}

export interface WsToolCall {
  type: "tool_call";
  agentId: string;
  agentName: string;
  tool: string;
  args: Record<string, unknown>;
  content: string;
}

export interface WsToolResult {
  type: "tool_result";
  agentId: string;
  agentName: string;
  tool: string;
  content: string;
}

export interface WsExecutionCompleted {
  type: "execution_completed";
  agentId: string;
  agentName: string;
  result: string;
}

export interface WsExecutionFailed {
  type: "execution_failed";
  error: string;
}

export interface WsWaitingApproval {
  type: "waiting_approval";
  agentId: string;
  agentName: string;
  result: string;
}

// ─── Discriminated union ──────────────────────────────────────────────

export type WsMessage =
  | WsExecutionStarted
  | WsStep
  | WsDelegation
  | WsToolCall
  | WsToolResult
  | WsExecutionCompleted
  | WsExecutionFailed
  | WsWaitingApproval;

// ─── Runtime parser ───────────────────────────────────────────────────

const KNOWN_TYPES = new Set<WsMessage["type"]>([
  "execution_started",
  "step",
  "delegation",
  "tool_call",
  "tool_result",
  "execution_completed",
  "execution_failed",
  "waiting_approval",
]);

/**
 * Parse a raw WebSocket `MessageEvent` into a typed `WsMessage`.
 * Returns `null` for malformed JSON or unknown event types so callers
 * can silently skip instead of crashing.
 */
export function parseWsMessage(event: MessageEvent): WsMessage | null {
  try {
    const raw: unknown = JSON.parse(event.data);
    if (
      typeof raw === "object" &&
      raw !== null &&
      "type" in raw &&
      typeof (raw as Record<string, unknown>).type === "string" &&
      KNOWN_TYPES.has((raw as Record<string, unknown>).type as WsMessage["type"])
    ) {
      return raw as WsMessage;
    }
    return null;
  } catch {
    return null;
  }
}
