const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "";

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
  allowedSubAgents: string[];
  maxSteps: number;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
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
  status: string;
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

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (typeof window !== "undefined") {
    const token = localStorage.getItem("mas_token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const isFormData = options?.body instanceof FormData;
  if (isFormData) {
    delete headers["Content-Type"];
  }

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { ...headers, ...(options?.headers || {}) },
    ...options,
  });

  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("mas_token");
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

  return res.json();
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
    list: (params?: { status?: string; parent_only?: boolean }) => {
      const query = new URLSearchParams();
      if (params?.status) query.set("status", params.status);
      if (params?.parent_only) query.set("parent_only", "true");
      return fetchAPI<Task[]>(`/tasks?${query.toString()}`);
    },
    get: (id: string) => fetchAPI<TaskDetail>(`/tasks/${id}`),
    create: (data: Partial<Task>) =>
      fetchAPI<Task>("/tasks", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    execute: (id: string) =>
      fetchAPI<{ message: string; taskId: string }>(`/tasks/${id}/execute`, {
        method: "POST",
      }),
    cancel: (id: string) =>
      fetchAPI<{ message: string }>(`/tasks/${id}/cancel`, {
        method: "POST",
      }),
  },
  executions: {
    get: (id: string) => fetchAPI<Execution>(`/executions/${id}`),
    getByTask: (taskId: string) =>
      fetchAPI<Execution>(`/executions/task/${taskId}`),
    getSteps: (id: string) =>
      fetchAPI<ExecutionStep[]>(`/executions/${id}/steps`),
  },
  dashboard: {
    stats: () => fetchAPI<DashboardStats>("/dashboard/stats"),
    activity: (limit = 20) =>
      fetchAPI<ActivityItem[]>(`/dashboard/activity?limit=${limit}`),
    topAgents: (limit = 5) =>
      fetchAPI<TopAgent[]>(`/dashboard/top-agents?limit=${limit}`),
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
    register: (data: any) =>
      fetchAPI<any>("/auth/register", {
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
    uploadAvatar: async (file: File): Promise<UserProfile> => {
      const token = typeof window !== "undefined" ? localStorage.getItem("mas_token") : null;
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/auth/me/avatar`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Upload failed");
      }
      return res.json();
    },
    deleteAvatar: () =>
      fetchAPI<UserProfile>("/auth/me/avatar", {
        method: "DELETE",
      }),
    logout: () => {
      if (typeof window !== "undefined") {
        localStorage.removeItem("mas_token");
        window.location.href = "/login";
      }
    },
  },
};

