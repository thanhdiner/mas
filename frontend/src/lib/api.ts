const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "";

import { getAuthToken, removeAuthToken } from "@/lib/auth";

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function apiBaseToWebSocketOrigin(apiBase: string): string {
  const normalized = stripTrailingSlash(apiBase);
  const wsProtocolBase = normalized
    .replace(/^http:\/\//i, "ws://")
    .replace(/^https:\/\//i, "wss://");

  return wsProtocolBase.replace(/\/api$/i, "");
}

export function getExecutionWebSocketUrl(executionId: string): string {
  const path = `/ws/executions/${executionId}`;

  if (WS_BASE.trim()) {
    return `${stripTrailingSlash(WS_BASE)}${path}`;
  }

  if (process.env.NEXT_PUBLIC_API_URL?.trim()) {
    const wsOrigin = apiBaseToWebSocketOrigin(process.env.NEXT_PUBLIC_API_URL);
    return `${wsOrigin}${path}`;
  }

  if (typeof window !== "undefined") {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${window.location.host}${path}`;
  }

  return `ws://localhost:8000${path}`;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  systemPrompt: string;
  allowedTools: string[];
  toolConfig?: Record<string, Record<string, unknown>>;
  allowedSubAgents: string[];
  maxSteps: number;
  active: boolean;
  model?: string | null;
  provider?: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface Task {
  id: string;
  title: string;
  input: string;
  status: TaskStatus;
  assignedAgentId: string;
  parentTaskId?: string;
  createdBy: string;
  allowDelegation: boolean;
  requiresApproval: boolean;
  result?: string;
  error?: string;
  createdAt: string;
  updatedAt?: string;
  agentName?: string;
}

export interface TaskDetail extends Task {
  agentName?: string;
  subtasks: SubtaskInfo[];
  execution?: Execution;
}

export interface SubtaskInfo {
  id: string;
  title: string;
  status: TaskStatus;
  assignedAgentId: string;
  agentName?: string;
}

export interface Execution {
  id: string;
  taskId: string;
  agentId: string;
  status: string;
  startedAt: string;
  endedAt?: string;
}

export interface ExecutionStep {
  id: string;
  executionId: string;
  taskId: string;
  agentId: string;
  stepType: string;
  content: string;
  meta?: Record<string, unknown>;
  createdAt: string;
}

export interface DashboardStats {
  totalAgents: number;
  activeAgents: number;
  runningTasks: number;
  queuedTasks: number;
  failedToday: number;
  waitingApprovals: number;
  activeRuns: number;
  totalTasks: number;
}

export interface ActivityItem {
  id: string;
  title: string;
  status: TaskStatus;
  agentName?: string;
  createdAt: string;
}

export interface TopAgent {
  agentId: string;
  agentName?: string;
  agentRole?: string;
  taskCount: number;
}

export type TaskStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "done"
  | "failed"
  | "cancelled";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  full_name?: string;
}

interface APIErrorPayload {
  code?: string;
  message?: string;
  detail?: string;
}

export class APIError extends Error {
  code?: string;
  status: number;
  detail?: string;

  constructor(
    message: string,
    { code, status, detail }: { code?: string; status: number; detail?: string }
  ) {
    super(message);
    this.name = "APIError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function parseAPIError(
  payload: unknown,
  fallbackMessage: string
): APIErrorPayload {
  if (!payload || typeof payload !== "object") {
    return { message: fallbackMessage, detail: fallbackMessage };
  }

  const error = payload as Record<string, unknown>;
  const message =
    typeof error.message === "string"
      ? error.message
      : typeof error.detail === "string"
        ? error.detail
        : fallbackMessage;

  return {
    code: typeof error.code === "string" ? error.code : undefined,
    message,
    detail: typeof error.detail === "string" ? error.detail : message,
  };
}

/**
 * Low-level fetch wrapper that centralises:
 *  1. Auth header injection (Bearer token)
 *  2. 401 → logout + redirect
 *  3. Error body parsing → throw APIError
 *
 * Every network call in `api.*` MUST go through this.
 */
async function fetchBase(
  path: string,
  options?: RequestInit
): Promise<Response> {
  const headers: Record<string, string> = {};

  // Auto-set JSON content-type unless the body is FormData
  const isFormData = options?.body instanceof FormData;
  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  // Inject auth token
  if (typeof window !== "undefined") {
    const token = getAuthToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers || {}) },
    credentials: "include",
  });

  if (!res.ok) {
    // Handle 401 globally
    if (res.status === 401 && typeof window !== "undefined") {
      removeAuthToken();
      if (
        !window.location.pathname.includes("/login") &&
        !window.location.pathname.includes("/register")
      ) {
        window.location.href = "/login";
      }
    }

    const errorPayload = await res.json().catch(() => null);
    const error = parseAPIError(errorPayload, res.statusText || "API Error");
    throw new APIError(error.message || "API Error", {
      code: error.code,
      status: res.status,
      detail: error.detail,
    });
  }

  return res;
}

/** Fetch JSON from the API. */
async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetchBase(path, options);
  return res.json();
}

/** Fetch a binary file (e.g. CSV export) from the API. */
async function fetchFile(
  path: string,
  options?: RequestInit
): Promise<{ blob: Blob; filename: string | null }> {
  const res = await fetchBase(path, options);

  const contentDisposition = res.headers.get("content-disposition") || "";
  const filenameMatch = contentDisposition.match(/filename="([^"]+)"/i);

  return {
    blob: await res.blob(),
    filename: filenameMatch ? filenameMatch[1] : null,
  };
}

export const api = {
  agents: {
    list: (activeOnly = false) =>
      fetchAPI<Agent[]>(`/agents?active_only=${activeOnly}`),
    get: (id: string) => fetchAPI<Agent>(`/agents/${id}`),
    create: (data: Partial<Agent>) =>
      fetchAPI<Agent>("/agents", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Agent>) =>
      fetchAPI<Agent>(`/agents/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchAPI<{ message: string }>(`/agents/${id}`, { method: "DELETE" }),
  },
  tasks: {
    list: (params?: { status?: string; parent_only?: boolean; page?: number; pageSize?: number }) => {
      const query = new URLSearchParams();
      if (params?.status) query.set("status", params.status);
      if (params?.parent_only) query.set("parent_only", "true");
      if (params?.page) query.set("page", String(params.page));
      if (params?.pageSize) query.set("page_size", String(params.pageSize));
      return fetchAPI<{ items: Task[]; total: number; page: number; pageSize: number }>(`/tasks?${query.toString()}`);
    },
    get: (id: string) => fetchAPI<TaskDetail>(`/tasks/${id}`),
    create: (data: Partial<Task>) =>
      fetchAPI<Task>("/tasks", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    execute: (id: string, smartRetry = false) =>
      fetchAPI<{ message: string; taskId: string }>(`/tasks/${id}/execute${smartRetry ? '?smart_retry=true' : ''}`, {
        method: "POST",
      }),
    cancel: (id: string) =>
      fetchAPI<{ message: string }>(`/tasks/${id}/cancel`, {
        method: "POST",
      }),
    approve: (id: string) =>
      fetchAPI<{ message: string; taskId: string }>(`/tasks/${id}/approve`, {
        method: "POST",
      }),
    reject: (id: string) =>
      fetchAPI<{ message: string; taskId: string }>(`/tasks/${id}/reject`, {
        method: "POST",
      }),
  },
  executions: {
    get: (id: string) => fetchAPI<Execution>(`/executions/${id}`),
    getByTask: (taskId: string) =>
      fetchAPI<Execution>(`/executions/task/${taskId}`),
    listByTask: (taskId: string) =>
      fetchAPI<Execution[]>(`/executions/task/${taskId}/history`),
    getSteps: (id: string) =>
      fetchAPI<ExecutionStep[]>(`/executions/${id}/steps`),
  },
  dashboard: {
    stats: () => fetchAPI<DashboardStats>("/dashboard/stats"),
    activity: (limit = 20) =>
      fetchAPI<ActivityItem[]>(`/dashboard/activity?limit=${limit}`),
    topAgents: (limit = 5) =>
      fetchAPI<TopAgent[]>(`/dashboard/top-agents?limit=${limit}`),
    analytics: () => fetchAPI<AnalyticsData>("/dashboard/analytics"),
  },
  auth: {
    login: async (email: string, password: string) => {
      const formData = new FormData();
      formData.append("username", email);
      formData.append("password", password);
      return fetchAPI<{ access_token: string; token_type: string }>(
        "/auth/login",
        {
          method: "POST",
          body: formData,
        }
      );
    },
    register: (data: RegisterInput) =>
      fetchAPI<UserProfile>("/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    me: () => fetchAPI<UserProfile>("/auth/me"),
    updateProfile: (data: { full_name?: string; email?: string }) =>
      fetchAPI<UserProfile>("/auth/me", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    changePassword: (data: { current_password: string; new_password: string }) =>
      fetchAPI<{ message: string }>("/auth/me/password", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    uploadAvatar: (file: File): Promise<UserProfile> => {
      const formData = new FormData();
      formData.append("file", file);
      return fetchAPI<UserProfile>("/auth/me/avatar", {
        method: "POST",
        body: formData,
      });
    },
    deleteAvatar: () =>
      fetchAPI<UserProfile>("/auth/me/avatar", {
        method: "DELETE",
      }),
    logout: async () => {
      if (typeof window !== "undefined") {
        // Call backend to clear HttpOnly cookie
        try {
          await fetch(`${API_BASE}/auth/logout`, {
            method: "POST",
            credentials: "include",
          });
        } catch {
          // Best-effort: even if backend is down, clear client-side tokens
        }
        removeAuthToken();
        window.location.href = "/login";
      }
    },
  },

  tools: {
    list: () => fetchAPI<ToolCatalogItem[]>("/tools"),
    updateSettings: (toolName: string, settings: Record<string, unknown>) => 
      fetchAPI<{ message: string; tool: string; settings: Record<string, unknown> }>(`/tools/${toolName}/settings`, {
        method: "PATCH",
        body: JSON.stringify(settings)
      }),
    listPresets: (toolName?: string) =>
      fetchAPI<ToolPreset[]>(
        `/tools/presets${toolName ? `?tool_name=${encodeURIComponent(toolName)}` : ""}`
      ),
    createPreset: (data: ToolPresetCreateInput) =>
      fetchAPI<ToolPreset>("/tools/presets", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updatePreset: (presetId: string, data: ToolPresetUpdateInput) =>
      fetchAPI<ToolPreset>(`/tools/presets/${presetId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    deletePreset: (presetId: string) =>
      fetchAPI<{ message: string; presetId: string }>(`/tools/presets/${presetId}`, {
        method: "DELETE",
      }),
    listCredentials: () => fetchAPI<ToolCredential[]>("/tools/credentials"),
    createCredential: (data: ToolCredentialCreateInput) =>
      fetchAPI<ToolCredential>("/tools/credentials", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateCredential: (credentialId: string, data: ToolCredentialUpdateInput) =>
      fetchAPI<ToolCredential>(`/tools/credentials/${credentialId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    deleteCredential: (credentialId: string) =>
      fetchAPI<{ message: string; credentialId: string }>(
        `/tools/credentials/${credentialId}`,
        {
          method: "DELETE",
        }
      ),
  },

  webhooks: {
    list: () => fetchAPI<Webhook[]>("/webhooks"),
    create: (data: WebhookCreateInput) =>
      fetchAPI<WebhookSecret>("/webhooks", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (webhookId: string, data: WebhookUpdateInput) =>
      fetchAPI<Webhook>(`/webhooks/${webhookId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (webhookId: string) =>
      fetchAPI<{ message: string; webhookId: string }>(`/webhooks/${webhookId}`, {
        method: "DELETE",
      }),
    rotateToken: (webhookId: string) =>
      fetchAPI<WebhookSecret>(`/webhooks/${webhookId}/rotate-token`, {
        method: "POST",
      }),
    listDeliveries: (
      webhookId: string,
      params?: {
        status?: WebhookDelivery["status"];
        from?: string;
        to?: string;
        skip?: number;
        limit?: number;
      }
    ) => {
      const query = new URLSearchParams();
      if (params?.status) query.set("status", params.status);
      if (params?.from) query.set("from", params.from);
      if (params?.to) query.set("to", params.to);
      if (typeof params?.skip === "number") {
        query.set("skip", String(params.skip));
      }
      if (typeof params?.limit === "number") {
        query.set("limit", String(params.limit));
      }
      const suffix = query.toString();
      return fetchAPI<WebhookDeliveryPage>(
        `/webhooks/${webhookId}/deliveries${suffix ? `?${suffix}` : ""}`
      );
    },
    exportDeliveries: (
      webhookId: string,
      params?: {
        status?: WebhookDelivery["status"];
        from?: string;
        to?: string;
      }
    ) => {
      const query = new URLSearchParams();
      if (params?.status) query.set("status", params.status);
      if (params?.from) query.set("from", params.from);
      if (params?.to) query.set("to", params.to);
      const suffix = query.toString();
      return fetchFile(
        `/webhooks/${webhookId}/deliveries/export${suffix ? `?${suffix}` : ""}`
      );
    },
    getRuntimeHealth: () =>
      fetchAPI<WebhookRuntimeHealth>("/webhooks/runtime-health"),
    getTestNotificationPreview: (kind: WebhookTestNotification["kind"]) =>
      fetchAPI<WebhookTestNotificationPreview>(
        `/webhooks/runtime-health/test-notification-preview?kind=${kind}`
      ),
    sendTestNotification: (kind: WebhookTestNotification["kind"]) =>
      fetchAPI<WebhookTestNotification>(
        `/webhooks/runtime-health/test-notification?kind=${kind}`,
        {
          method: "POST",
        }
      ),
  },

  schedules: {
    list: () => fetchAPI<Schedule[]>("/schedules"),
    get: (id: string) => fetchAPI<Schedule>(`/schedules/${id}`),
    create: (data: ScheduleCreate) =>
      fetchAPI<Schedule>("/schedules", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<ScheduleCreate>) =>
      fetchAPI<Schedule>(`/schedules/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchAPI<void>(`/schedules/${id}`, { method: "DELETE" }),
    toggle: (id: string, active: boolean) =>
      fetchAPI<Schedule>(`/schedules/${id}/toggle?active=${active}`, {
        method: "POST",
      }),
  },

  playground: {
    chat: (agentId: string, messages: { role: string; content: string }[], model?: string) =>
      fetchAPI<PlaygroundResponse>("/playground/chat", {
        method: "POST",
        body: JSON.stringify({ agentId, messages, model: model || undefined }),
      }),
    models: () => fetchAPI<LLMModel[]>("/playground/models"),
  },

  knowledge: {
    list: () => fetchAPI<KnowledgeDoc[]>("/knowledge"),
    get: (id: string) => fetchAPI<KnowledgeDoc & { textPreview: string }>(`/knowledge/${id}`),
    upload: (file: File, name?: string, description?: string, tags?: string): Promise<KnowledgeDoc> => {
      const formData = new FormData();
      formData.append("file", file);
      if (name) formData.append("name", name);
      if (description) formData.append("description", description);
      if (tags) formData.append("tags", tags);
      return fetchAPI<KnowledgeDoc>("/knowledge/upload", {
        method: "POST",
        body: formData,
      });
    },
    delete: (id: string) => fetchAPI<{ message: string }>(`/knowledge/${id}`, { method: "DELETE" }),
    search: (q: string) => fetchAPI<{ id: string; name: string; snippet: string }[]>(`/knowledge/search/query?q=${encodeURIComponent(q)}`),
  },

  settings: {
    getLLM: () => fetchAPI<LLMSettings>("/settings/llm"),
    updateLLM: (data: LLMSettingsUpdate) =>
      fetchAPI<LLMSettings>("/settings/llm", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    getGeneral: () => fetchAPI<GeneralSettings>("/settings/general"),
    updateGeneral: (data: GeneralSettingsUpdate) =>
      fetchAPI<GeneralSettings>("/settings/general", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
  },
};

// ─── Schedule Types ──────────────────────────────────────────────────
export interface Schedule {
  id: string;
  name: string;
  agentId: string;
  agentName?: string;
  promptPayload: string;
  scheduleType: "cron" | "interval" | "once";
  cronExpression?: string;
  intervalSeconds?: number;
  runAt?: string;
  timezone: string;
  isActive: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  totalRuns: number;
  createdAt: string;
  updatedAt?: string;
}

export interface ScheduleCreate {
  name: string;
  agentId: string;
  promptPayload: string;
  scheduleType: "cron" | "interval" | "once";
  cronExpression?: string;
  intervalSeconds?: number;
  runAt?: string;
  timezone?: string;
  isActive?: boolean;
}

export interface PlaygroundResponse {
  role: string;
  content: string;
  toolCalls: { name: string; arguments: string; id: string }[];
  model?: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface LLMModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  available: boolean;
}

export interface AnalyticsData {
  statusBreakdown: Record<string, number>;
  dailyTasks: { date: string; count: number }[];
  agentPerformance: {
    agentId: string;
    agentName: string;
    total: number;
    completed: number;
    failed: number;
    successRate: number;
  }[];
  schedules: { total: number; active: number };
}

export interface KnowledgeDoc {
  id: string;
  name: string;
  filename: string;
  description: string;
  fileSize: number;
  fileType: string;
  tags: string[];
  uploadedAt: string;
}

// ─── Settings Types ──────────────────────────────────────────────────

export interface LLMSettings {
  default_provider: string;
  default_model: string;
  openai_api_key_set: boolean;
  anthropic_api_key_set: boolean;
  gemini_api_key_set: boolean;
  deepseek_api_key_set: boolean;
  groq_api_key_set: boolean;
  together_api_key_set: boolean;
  openai_api_key_hint: string;
  anthropic_api_key_hint: string;
  gemini_api_key_hint: string;
  deepseek_api_key_hint: string;
  groq_api_key_hint: string;
  together_api_key_hint: string;
}

export interface LLMSettingsUpdate {
  default_provider?: string | null;
  default_model?: string | null;
  openai_api_key?: string | null;
  anthropic_api_key?: string | null;
  gemini_api_key?: string | null;
  deepseek_api_key?: string | null;
  groq_api_key?: string | null;
  together_api_key?: string | null;
}

export interface GeneralSettings {
  app_name: string;
  max_delegation_depth: number;
  max_steps_default: number;
}

export interface GeneralSettingsUpdate {
  app_name?: string | null;
  max_delegation_depth?: number | null;
  max_steps_default?: number | null;
}

export interface ToolConfigField {
  name: string;
  type: "string" | "number";
  label: string;
  description: string;
  default: string | number;
}

export interface ToolPreset {
  id: string;
  name: string;
  description: string;
  toolName: string;
  values: Record<string, string | number>;
  createdAt: string;
  updatedAt: string | null;
}

export interface ToolCatalogItem {
  name: string;
  description: string;
  configSchema?: ToolConfigField[];
  globalSettings?: Record<string, unknown>;
  presets?: ToolPreset[];
}

export interface ToolCredential {
  id: string;
  name: string;
  description: string;
  headerKeys: string[];
  createdAt: string;
  updatedAt: string | null;
}

export interface ToolCredentialCreateInput {
  name: string;
  description?: string;
  headers: Record<string, string>;
}

export interface ToolCredentialUpdateInput {
  name?: string;
  description?: string;
  headers?: Record<string, string>;
}

export interface ToolPresetCreateInput {
  name: string;
  description?: string;
  toolName: string;
  values: Record<string, string | number>;
}

export interface ToolPresetUpdateInput {
  name?: string;
  description?: string;
  values?: Record<string, string | number>;
}

export interface Webhook {
  id: string;
  name: string;
  description: string;
  agentId: string;
  agentName?: string | null;
  taskTitle: string;
  allowDelegation: boolean;
  requiresApproval: boolean;
  active: boolean;
  lastTriggeredAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface WebhookSecret extends Webhook {
  token: string;
  triggerUrl: string;
}

export interface WebhookCreateInput {
  name: string;
  description?: string;
  agentId: string;
  taskTitle: string;
  allowDelegation?: boolean;
  requiresApproval?: boolean;
  active?: boolean;
}

export interface WebhookUpdateInput {
  name?: string;
  description?: string;
  agentId?: string;
  taskTitle?: string;
  allowDelegation?: boolean;
  requiresApproval?: boolean;
  active?: boolean;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  status: "processing" | "accepted" | "duplicate" | "failed";
  taskId?: string | null;
  duplicate: boolean;
  idempotencyKey?: string | null;
  requestMethod: string;
  contentType?: string | null;
  payloadPreview?: string | null;
  payloadSizeBytes: number;
  payloadTruncated: boolean;
  error?: string | null;
  receivedAt: string;
  updatedAt?: string | null;
}

export interface WebhookDeliveryPage {
  items: WebhookDelivery[];
  total: number;
  skip: number;
  limit: number;
  hasMore: boolean;
  status?: WebhookDelivery["status"] | null;
  fromTime?: string | null;
  toTime?: string | null;
}

export interface WebhookCleanupStatus {
  lastRunAt?: string | null;
  lastSuccessAt?: string | null;
  lastStatus: "never_run" | "success" | "failed";
  lastDurationMs?: number | null;
  deliveriesDeleted: number;
  idempotencyDeleted: number;
  lastError?: string | null;
}

export interface WebhookAlertingStatus {
  configured: boolean;
  transport: string;
  cooldownMinutes: number;
  timeoutSeconds: number;
  incidentOpen: boolean;
  lastAttemptAt?: string | null;
  lastSentAt?: string | null;
  lastStatus: "disabled" | "idle" | "sent" | "failed";
  lastError?: string | null;
  lastResolvedAttemptAt?: string | null;
  lastResolvedSentAt?: string | null;
  lastResolvedStatus: "disabled" | "idle" | "sent" | "failed";
  lastResolvedError?: string | null;
}

export interface WebhookRuntimeHealth {
  deliveryRetentionDays: number;
  idempotencyRetentionDays: number;
  cleanupIntervalHours: number;
  deliveryBacklogAlertThresholdHours: number;
  deliveryCutoff: string;
  idempotencyCutoff: string;
  expiredDeliveriesPending: number;
  expiredIdempotencyPending: number;
  oldestExpiredDeliveryAt?: string | null;
  deliveryBacklogAlert: boolean;
  deliveryBacklogAlertMessage?: string | null;
  deliveryRetentionIndexReady: boolean;
  idempotencyRetentionIndexReady: boolean;
  deliveryListIndexReady: boolean;
  jobScheduled: boolean;
  nextScheduledRunAt?: string | null;
  cleanup: WebhookCleanupStatus;
  alerting: WebhookAlertingStatus;
}

export interface WebhookTestNotification {
  message: string;
  kind: "alert" | "resolved";
  event: string;
  sentAt: string;
  test: boolean;
}

export interface WebhookTestNotificationPreview {
  message: string;
  kind: "alert" | "resolved";
  event: string;
  payload: Record<string, unknown>;
  test: boolean;
}
