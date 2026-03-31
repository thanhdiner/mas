"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Fuse from "fuse.js";
import {
  History,
  Bot,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Eye,
  ChevronLeft,
  ChevronRight,
  Pin,
  PinOff,
  PencilLine,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Trash2,
  Webhook as WebhookIcon,
  X,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  api,
  type Agent,
  type Webhook,
  type WebhookDelivery,
  type WebhookDeliveryPage,
  type WebhookTestNotificationPreview,
  type WebhookRuntimeHealth,
} from "@/lib/api";

interface SecretRevealState {
  name: string;
  token: string;
  triggerUrl: string;
}

interface DeliveryTimeRange {
  from: string;
  to: string;
}

interface TestNotificationPreviewState extends WebhookTestNotificationPreview {
  changedEntries: ChangedPreviewEntry[];
  changedPaths: string[];
  generatedAt: string | null;
  payloadJson: string;
  previousGeneratedAt: string | null;
}

interface ChangedPreviewEntry {
  path: string;
  previousExcerpt: string;
  nextExcerpt: string;
}

interface JsonPreviewLine {
  changed: boolean;
  content: string;
  path?: string;
}

interface NumberedJsonPreviewLine extends JsonPreviewLine {
  lineNumber: number;
}

type DeliveryFilter = "all" | WebhookDelivery["status"];

const DELIVERY_FILTER_OPTIONS: Array<{
  value: DeliveryFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "accepted", label: "Accepted" },
  { value: "duplicate", label: "Duplicate" },
  { value: "failed", label: "Failed" },
];

const DELIVERY_PAGE_SIZE = 10;
const RUNTIME_HEALTH_PIN_PREFIX = "runtimeHealth.";
const GENERATED_AT_PIN_PATH = "generatedAt";
const WEBHOOK_CHANGED_DIFF_RULES_STORAGE_PREFIX =
  "mas:webhooks:changed-preview-rules:";

type ChangedDiffPresetRule = {
  id: string;
  label: string;
  prefixes: string[];
  paths: string[];
};

const CHANGED_DIFF_PRESET_RULES = [
  {
    id: "runtime-health",
    label: "runtimeHealth.*",
    prefixes: [RUNTIME_HEALTH_PIN_PREFIX],
    paths: [],
  },
  {
    id: "generated-at",
    label: "generatedAt",
    prefixes: [],
    paths: [GENERATED_AT_PIN_PATH],
  },
  {
    id: "retention-cutoffs",
    label: "delivery/idempotency cutoff",
    prefixes: [],
    paths: [
      "runtimeHealth.deliveryCutoff",
      "runtimeHealth.idempotencyCutoff",
    ],
  },
] satisfies ChangedDiffPresetRule[];

const CHANGED_DIFF_PRESET_PREFIX_VALUES = Array.from(
  new Set(CHANGED_DIFF_PRESET_RULES.flatMap((preset) => preset.prefixes))
);
const CHANGED_DIFF_PRESET_PATH_VALUES = Array.from(
  new Set(CHANGED_DIFF_PRESET_RULES.flatMap((preset) => preset.paths))
);

interface PersistedChangedPreviewRules {
  version: 1;
  customPrefixes: string[];
  presetPrefixes: string[];
  presetPaths: string[];
}

function formatTimestamp(value?: string | null): string {
  if (!value) {
    return "Never";
  }

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDeliveryStatusClass(status: WebhookDelivery["status"]): string {
  switch (status) {
    case "accepted":
      return "bg-[#14b8a61a] text-[#5eead4]";
    case "duplicate":
      return "bg-[#7bd0ff1a] text-accent-cyan";
    case "failed":
      return "bg-[#ffb4ab1a] text-[#ffb4ab]";
    default:
      return "bg-white/5 text-on-surface-dim";
  }
}

function datetimeLocalToIso(value: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function extractGeneratedAt(payload: Record<string, unknown>): string | null {
  const generatedAt = payload.generatedAt;
  return typeof generatedAt === "string" ? generatedAt : null;
}

function normalizePinnedChangedPreviewPrefix(value: string): string {
  return value.trim().replace(/\*+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function filterStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const paddingLength = (4 - (normalized.length % 4)) % 4;
    const padded = `${normalized}${"=".repeat(paddingLength)}`;
    const decoded = window.atob(padded);
    const bytes = Uint8Array.from(decoded, (character) =>
      character.charCodeAt(0)
    );
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

function getWebhookChangedPreviewRulesStorageKey(): string {
  if (typeof window === "undefined") {
    return `${WEBHOOK_CHANGED_DIFF_RULES_STORAGE_PREFIX}anonymous`;
  }

  const token = window.localStorage.getItem("mas_token");
  const payload = token ? decodeJwtPayload(token) : null;
  const scopeCandidates = [
    payload?.sub,
    payload?.email,
    payload?.user_id,
    payload?.preferred_username,
  ];
  const resolvedScope = scopeCandidates.find(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );

  return `${WEBHOOK_CHANGED_DIFF_RULES_STORAGE_PREFIX}${encodeURIComponent(
    resolvedScope ?? "anonymous"
  )}`;
}

function loadWebhookChangedPreviewRules(
  storageKey: string
): PersistedChangedPreviewRules {
  const emptyState: PersistedChangedPreviewRules = {
    version: 1,
    customPrefixes: [],
    presetPrefixes: [],
    presetPaths: [],
  };

  if (typeof window === "undefined") {
    return emptyState;
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) {
      return emptyState;
    }

    const parsedValue = JSON.parse(rawValue) as Record<string, unknown>;
    const customPrefixes = dedupeStrings(
      filterStringArray(parsedValue.customPrefixes)
        .map((value) => normalizePinnedChangedPreviewPrefix(value))
        .filter(Boolean)
    );
    const presetPrefixes = dedupeStrings(
      filterStringArray(parsedValue.presetPrefixes).filter((value) =>
        CHANGED_DIFF_PRESET_PREFIX_VALUES.includes(value)
      )
    );
    const presetPaths = dedupeStrings(
      filterStringArray(parsedValue.presetPaths).filter((value) =>
        CHANGED_DIFF_PRESET_PATH_VALUES.includes(value)
      )
    );

    return {
      version: 1,
      customPrefixes,
      presetPrefixes,
      presetPaths,
    };
  } catch {
    return emptyState;
  }
}

function saveWebhookChangedPreviewRules(
  storageKey: string,
  rules: PersistedChangedPreviewRules
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(rules));
}

function formatChangedValueExcerpt(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    return String(value);
  }

  const singleLine = serialized.replace(/\s+/g, " ");
  return singleLine.length <= 160
    ? singleLine
    : `${singleLine.slice(0, 157)}...`;
}

function collectChangedEntries(
  previousValue: unknown,
  nextValue: unknown,
  currentPath = ""
): ChangedPreviewEntry[] {
  if (Array.isArray(previousValue) && Array.isArray(nextValue)) {
    const maxLength = Math.max(previousValue.length, nextValue.length);
    let changedEntries: ChangedPreviewEntry[] = [];

    for (let index = 0; index < maxLength; index += 1) {
      const nextPath = currentPath ? `${currentPath}[${index}]` : `[${index}]`;
      changedEntries = changedEntries.concat(
        collectChangedEntries(previousValue[index], nextValue[index], nextPath)
      );
    }

    return changedEntries;
  }

  if (isRecord(previousValue) && isRecord(nextValue)) {
    const keys = new Set([
      ...Object.keys(previousValue),
      ...Object.keys(nextValue),
    ]);
    let changedEntries: ChangedPreviewEntry[] = [];

    for (const key of keys) {
      const nextPath = currentPath ? `${currentPath}.${key}` : key;
      changedEntries = changedEntries.concat(
        collectChangedEntries(previousValue[key], nextValue[key], nextPath)
      );
    }

    return changedEntries;
  }

  if (previousValue === nextValue) {
    return [];
  }

  return [
    {
      path: currentPath || "(root)",
      previousExcerpt: formatChangedValueExcerpt(previousValue),
      nextExcerpt: formatChangedValueExcerpt(nextValue),
    },
  ];
}

function formatJsonPrimitive(value: unknown): string {
  return JSON.stringify(value);
}

function buildJsonPreviewLines(
  value: unknown,
  changedPaths: string[]
): JsonPreviewLine[] {
  const changedPathSet = new Set(changedPaths);
  const lines: JsonPreviewLine[] = [];

  const pushLine = (content: string, path?: string) => {
    lines.push({
      changed: path !== undefined && changedPathSet.has(path),
      content,
      path,
    });
  };

  const renderValue = (
    currentValue: unknown,
    indentLevel: number,
    path: string,
    trailingComma: boolean
  ) => {
    const indent = "  ".repeat(indentLevel);

    if (Array.isArray(currentValue)) {
      if (currentValue.length === 0) {
        pushLine(`${indent}[]${trailingComma ? "," : ""}`, path);
        return;
      }

      pushLine(`${indent}[`, path);
      currentValue.forEach((item, index) => {
        const itemPath = path ? `${path}[${index}]` : `[${index}]`;
        renderValue(item, indentLevel + 1, itemPath, index < currentValue.length - 1);
      });
      pushLine(`${indent}]${trailingComma ? "," : ""}`);
      return;
    }

    if (isRecord(currentValue)) {
      const entries = Object.entries(currentValue);
      if (entries.length === 0) {
        pushLine(`${indent}{}${trailingComma ? "," : ""}`, path);
        return;
      }

      pushLine(`${indent}{`, path);
      entries.forEach(([key, childValue], index) => {
        const childPath = path ? `${path}.${key}` : key;
        renderProperty(
          key,
          childValue,
          indentLevel + 1,
          childPath,
          index < entries.length - 1
        );
      });
      pushLine(`${indent}}${trailingComma ? "," : ""}`);
      return;
    }

    pushLine(
      `${indent}${formatJsonPrimitive(currentValue)}${trailingComma ? "," : ""}`,
      path
    );
  };

  const renderProperty = (
    key: string,
    currentValue: unknown,
    indentLevel: number,
    path: string,
    trailingComma: boolean
  ) => {
    const indent = "  ".repeat(indentLevel);
    const keyPrefix = `${indent}${JSON.stringify(key)}: `;

    if (Array.isArray(currentValue)) {
      if (currentValue.length === 0) {
        pushLine(`${keyPrefix}[]${trailingComma ? "," : ""}`, path);
        return;
      }

      pushLine(`${keyPrefix}[`, path);
      currentValue.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;
        renderValue(item, indentLevel + 1, itemPath, index < currentValue.length - 1);
      });
      pushLine(`${indent}]${trailingComma ? "," : ""}`);
      return;
    }

    if (isRecord(currentValue)) {
      const entries = Object.entries(currentValue);
      if (entries.length === 0) {
        pushLine(`${keyPrefix}{}${trailingComma ? "," : ""}`, path);
        return;
      }

      pushLine(`${keyPrefix}{`, path);
      entries.forEach(([childKey, childValue], index) => {
        const childPath = `${path}.${childKey}`;
        renderProperty(
          childKey,
          childValue,
          indentLevel + 1,
          childPath,
          index < entries.length - 1
        );
      });
      pushLine(`${indent}}${trailingComma ? "," : ""}`);
      return;
    }

    pushLine(
      `${keyPrefix}${formatJsonPrimitive(currentValue)}${trailingComma ? "," : ""}`,
      path
    );
  };

  renderValue(value, 0, "", false);
  return lines;
}

function WebhooksContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = 10;

  const { data: queryData, isLoading: loading } = useQuery({
    queryKey: ["webhooks", page],
    queryFn: () => Promise.all([
      api.webhooks.list({ page, pageSize }),
      api.agents.list(true),
      api.webhooks.getRuntimeHealth(),
    ]),
  });
  
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [totalWebhooks, setTotalWebhooks] = useState(0);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [runtimeHealth, setRuntimeHealth] = useState<WebhookRuntimeHealth | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalWebhooks / pageSize));

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    if (newPage > 1) {
      params.set("page", newPage.toString());
    } else {
      params.delete("page");
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  // Sync query data to local state (needed for local mutations)
  useEffect(() => {
    if (queryData) {
      const webhooksResult = queryData[0] as any;
      setWebhooks(webhooksResult?.items ?? []);
      setTotalWebhooks(webhooksResult?.total ?? 0);
      setAgents(queryData[1]);
      setRuntimeHealth(queryData[2]);
    }
  }, [queryData]);

  const [pageError, setPageError] = useState("");
  const [pageNotice, setPageNotice] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyWebhookId, setBusyWebhookId] = useState<string | null>(null);
  const [secretReveal, setSecretReveal] = useState<SecretRevealState | null>(null);
  const [copiedValue, setCopiedValue] = useState("");
  const [expandedWebhookId, setExpandedWebhookId] = useState<string | null>(null);
  const [deliveryPagesByWebhook, setDeliveryPagesByWebhook] = useState<
    Record<string, WebhookDeliveryPage>
  >({});
  const [deliveryFilterByWebhook, setDeliveryFilterByWebhook] = useState<
    Record<string, DeliveryFilter>
  >({});
  const [deliveryTimeRangeByWebhook, setDeliveryTimeRangeByWebhook] = useState<
    Record<string, DeliveryTimeRange>
  >({});
  const [loadingDeliveryWebhookId, setLoadingDeliveryWebhookId] = useState<
    string | null
  >(null);
  const [loadingMoreWebhookId, setLoadingMoreWebhookId] = useState<
    string | null
  >(null);
  const [exportingWebhookId, setExportingWebhookId] = useState<string | null>(
    null
  );
  const [previewingNotificationKind, setPreviewingNotificationKind] = useState<
    "alert" | "resolved" | null
  >(null);
  const [testingNotificationKind, setTestingNotificationKind] = useState<
    "alert" | "resolved" | null
  >(null);
  const [testNotificationPreview, setTestNotificationPreview] =
    useState<TestNotificationPreviewState | null>(null);
  const [showOnlyChangedPreviewLines, setShowOnlyChangedPreviewLines] =
    useState(false);
  const [activeChangedPreviewLineNumber, setActiveChangedPreviewLineNumber] =
    useState<number | null>(null);
  const [expandedChangedPreviewPaths, setExpandedChangedPreviewPaths] =
    useState<string[]>([]);
  const [pinnedChangedPreviewPaths, setPinnedChangedPreviewPaths] = useState<
    string[]
  >([]);
  const [pinnedChangedPreviewPrefixes, setPinnedChangedPreviewPrefixes] =
    useState<string[]>([]);
  const [presetPinnedChangedPreviewPaths, setPresetPinnedChangedPreviewPaths] =
    useState<string[]>([]);
  const [presetPinnedChangedPreviewPrefixes, setPresetPinnedChangedPreviewPrefixes] =
    useState<string[]>([]);
  const [changedPreviewRulesStorageKey, setChangedPreviewRulesStorageKey] =
    useState<string | null>(null);
  const [changedPreviewRulesLoaded, setChangedPreviewRulesLoaded] =
    useState(false);
  const [customPinnedChangedPreviewPrefix, setCustomPinnedChangedPreviewPrefix] =
    useState("");
  const [customPinnedChangedPreviewPrefixError, setCustomPinnedChangedPreviewPrefixError] =
    useState("");
  const [previewActionMessage, setPreviewActionMessage] = useState("");
  const [previewActionError, setPreviewActionError] = useState("");
  const [debugDelivery, setDebugDelivery] = useState<WebhookDelivery | null>(
    null
  );
  const previewPayloadLineRefs = useRef<Record<number, HTMLDivElement | null>>(
    {}
  );

  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formAgentId, setFormAgentId] = useState("");
  const [formTaskTitle, setFormTaskTitle] = useState("Webhook Trigger");
  const [formAllowDelegation, setFormAllowDelegation] = useState(true);
  const [formRequiresApproval, setFormRequiresApproval] = useState(false);
  const [formActive, setFormActive] = useState(true);
  const [formError, setFormError] = useState("");

  const fetchData = useCallback(async () => {
    setPageError("");
    queryClient.invalidateQueries({ queryKey: ["webhooks"] });
  }, [queryClient]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  useEffect(() => {
    const storageKey = getWebhookChangedPreviewRulesStorageKey();
    const persistedRules = loadWebhookChangedPreviewRules(storageKey);

    setPinnedChangedPreviewPrefixes(persistedRules.customPrefixes);
    setPresetPinnedChangedPreviewPrefixes(persistedRules.presetPrefixes);
    setPresetPinnedChangedPreviewPaths(persistedRules.presetPaths);
    setChangedPreviewRulesStorageKey(storageKey);
    setChangedPreviewRulesLoaded(true);
  }, []);

  useEffect(() => {
    if (!changedPreviewRulesLoaded || !changedPreviewRulesStorageKey) {
      return;
    }

    saveWebhookChangedPreviewRules(changedPreviewRulesStorageKey, {
      version: 1,
      customPrefixes: pinnedChangedPreviewPrefixes,
      presetPrefixes: presetPinnedChangedPreviewPrefixes,
      presetPaths: presetPinnedChangedPreviewPaths,
    });
  }, [
    changedPreviewRulesLoaded,
    changedPreviewRulesStorageKey,
    pinnedChangedPreviewPrefixes,
    presetPinnedChangedPreviewPaths,
    presetPinnedChangedPreviewPrefixes,
  ]);

  useEffect(() => {
    if (!copiedValue) {
      return;
    }

    const timeout = window.setTimeout(() => setCopiedValue(""), 1800);
    return () => window.clearTimeout(timeout);
  }, [copiedValue]);

  useEffect(() => {
    if (!pageNotice) {
      return;
    }

    const timeout = window.setTimeout(() => setPageNotice(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [pageNotice]);

  const filteredWebhooks = useMemo(() => {
    const query = debouncedSearch.trim();
    if (!query) return webhooks;

    const fuse = new Fuse(webhooks, {
      keys: ["name", "description", "agentName", "taskTitle"],
      threshold: 0.4,
      ignoreLocation: true,
      includeMatches: false,
    });

    return fuse.search(query).map((result) => result.item);
  }, [webhooks, debouncedSearch]);

  const previewPayloadLines = useMemo(
    () =>
      testNotificationPreview
        ? buildJsonPreviewLines(
            testNotificationPreview.payload,
            testNotificationPreview.changedPaths
          )
        : [],
    [testNotificationPreview]
  );

  const visiblePreviewPayloadLines = useMemo<NumberedJsonPreviewLine[]>(
    () =>
      previewPayloadLines
        .map((line, index) => ({
          ...line,
          lineNumber: index + 1,
        }))
        .filter((line) => !showOnlyChangedPreviewLines || line.changed),
    [previewPayloadLines, showOnlyChangedPreviewLines]
  );

  const changedPreviewLineNumbers = useMemo(
    () =>
      previewPayloadLines
        .map((line, index) => ({ changed: line.changed, lineNumber: index + 1 }))
        .filter((line) => line.changed)
        .map((line) => line.lineNumber),
    [previewPayloadLines]
  );

  const changedPreviewPathToLineNumber = useMemo(() => {
    const pathToLineNumber = new Map<string, number>();
    previewPayloadLines.forEach((line, index) => {
      if (line.path && !pathToLineNumber.has(line.path)) {
        pathToLineNumber.set(line.path, index + 1);
      }
    });
    return pathToLineNumber;
  }, [previewPayloadLines]);

  const autoPinnedChangedPreviewPaths = useMemo(() => {
    if (!testNotificationPreview) {
      return [];
    }

    return testNotificationPreview.changedEntries
      .map((entry) => entry.path)
      .filter((path) =>
        pinnedChangedPreviewPrefixes.some((prefix) => path.startsWith(prefix)) ||
        presetPinnedChangedPreviewPrefixes.some((prefix) =>
          path.startsWith(prefix)
        ) ||
        presetPinnedChangedPreviewPaths.includes(path)
      );
  }, [
    pinnedChangedPreviewPrefixes,
    presetPinnedChangedPreviewPaths,
    presetPinnedChangedPreviewPrefixes,
    testNotificationPreview,
  ]);

  const effectivePinnedChangedPreviewPaths = useMemo(
    () =>
      Array.from(
        new Set([
          ...pinnedChangedPreviewPaths,
          ...autoPinnedChangedPreviewPaths,
        ])
      ),
    [autoPinnedChangedPreviewPaths, pinnedChangedPreviewPaths]
  );

  const expandedChangedPreviewEntries = useMemo(
    () =>
      expandedChangedPreviewPaths
        .map((path) =>
          testNotificationPreview?.changedEntries.find((entry) => entry.path === path)
        )
        .filter((entry): entry is ChangedPreviewEntry => Boolean(entry))
        .sort((left, right) => {
          const leftPinned = effectivePinnedChangedPreviewPaths.includes(left.path)
            ? 1
            : 0;
          const rightPinned = effectivePinnedChangedPreviewPaths.includes(right.path)
            ? 1
            : 0;
          if (leftPinned !== rightPinned) {
            return rightPinned - leftPinned;
          }
          return left.path.localeCompare(right.path);
        }),
    [
      effectivePinnedChangedPreviewPaths,
      expandedChangedPreviewPaths,
      testNotificationPreview,
    ]
  );

  const orderedChangedPreviewEntries = useMemo(() => {
    if (!testNotificationPreview) {
      return [];
    }

    return [...testNotificationPreview.changedEntries].sort((left, right) => {
      const leftPinned = effectivePinnedChangedPreviewPaths.includes(left.path)
        ? 1
        : 0;
      const rightPinned = effectivePinnedChangedPreviewPaths.includes(right.path)
        ? 1
        : 0;
      if (leftPinned !== rightPinned) {
        return rightPinned - leftPinned;
      }
      return left.path.localeCompare(right.path);
    });
  }, [effectivePinnedChangedPreviewPaths, testNotificationPreview]);

  const pinnedChangedPreviewEntries = useMemo(
    () =>
      effectivePinnedChangedPreviewPaths
        .map((path) =>
          testNotificationPreview?.changedEntries.find((entry) => entry.path === path)
        )
        .filter((entry): entry is ChangedPreviewEntry => Boolean(entry)),
    [effectivePinnedChangedPreviewPaths, testNotificationPreview]
  );

  useEffect(() => {
    if (changedPreviewLineNumbers.length === 0) {
      setActiveChangedPreviewLineNumber(null);
      return;
    }

    setActiveChangedPreviewLineNumber((current) =>
      current !== null && changedPreviewLineNumbers.includes(current)
        ? current
        : changedPreviewLineNumbers[0]
    );
  }, [changedPreviewLineNumbers]);

  useEffect(() => {
    if (activeChangedPreviewLineNumber === null) {
      return;
    }

    const targetLine = previewPayloadLineRefs.current[activeChangedPreviewLineNumber];
    if (!targetLine) {
      return;
    }

    targetLine.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [activeChangedPreviewLineNumber, visiblePreviewPayloadLines]);

  useEffect(() => {
    const validPaths = new Set(
      testNotificationPreview?.changedEntries.map((entry) => entry.path) ?? []
    );
    setExpandedChangedPreviewPaths((current) => {
      const next = Array.from(
        new Set([
          ...current.filter((path) => validPaths.has(path)),
          ...effectivePinnedChangedPreviewPaths.filter((path) => validPaths.has(path)),
        ])
      );
      if (next.length === current.length && next.every((val, i) => val === current[i])) {
        return current;
      }
      return next;
    });
    setPinnedChangedPreviewPaths((current) => {
      const next = current.filter((path) => validPaths.has(path));
      if (next.length === current.length) {
        return current;
      }
      return next;
    });
  }, [
    effectivePinnedChangedPreviewPaths,
    testNotificationPreview,
  ]);

  const isManuallyPinnedChangedPreviewPath = useCallback(
    (path: string) => pinnedChangedPreviewPaths.includes(path),
    [pinnedChangedPreviewPaths]
  );

  const isAutoPinnedChangedPreviewPath = useCallback(
    (path: string) =>
      pinnedChangedPreviewPrefixes.some((prefix) => path.startsWith(prefix)) ||
      presetPinnedChangedPreviewPrefixes.some((prefix) =>
        path.startsWith(prefix)
      ) ||
      presetPinnedChangedPreviewPaths.includes(path),
    [
      pinnedChangedPreviewPrefixes,
      presetPinnedChangedPreviewPaths,
      presetPinnedChangedPreviewPrefixes,
    ]
  );

  const isEffectivelyPinnedChangedPreviewPath = useCallback(
    (path: string) => effectivePinnedChangedPreviewPaths.includes(path),
    [effectivePinnedChangedPreviewPaths]
  );

  const resetForm = useCallback(() => {
    setEditingWebhook(null);
    setFormName("");
    setFormDescription("");
    setFormAgentId("");
    setFormTaskTitle("Webhook Trigger");
    setFormAllowDelegation(true);
    setFormRequiresApproval(false);
    setFormActive(true);
    setFormError("");
  }, []);

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (webhook: Webhook) => {
    setEditingWebhook(webhook);
    setFormName(webhook.name);
    setFormDescription(webhook.description);
    setFormAgentId(webhook.agentId);
    setFormTaskTitle(webhook.taskTitle);
    setFormAllowDelegation(webhook.allowDelegation);
    setFormRequiresApproval(webhook.requiresApproval);
    setFormActive(webhook.active);
    setFormError("");
    setDialogOpen(true);
  };

  const handleCopy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(label);
    } catch {
      setPageError("Failed to copy to clipboard.");
    }
  };

  const handleSave = async () => {
    if (!formName.trim() || !formAgentId || !formTaskTitle.trim()) {
      setFormError("Name, agent, and task title are required.");
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      if (editingWebhook) {
        await api.webhooks.update(editingWebhook.id, {
          name: formName.trim(),
          description: formDescription.trim(),
          agentId: formAgentId,
          taskTitle: formTaskTitle.trim(),
          allowDelegation: formAllowDelegation,
          requiresApproval: formRequiresApproval,
          active: formActive,
        });
      } else {
        const created = await api.webhooks.create({
          name: formName.trim(),
          description: formDescription.trim(),
          agentId: formAgentId,
          taskTitle: formTaskTitle.trim(),
          allowDelegation: formAllowDelegation,
          requiresApproval: formRequiresApproval,
          active: formActive,
        });
        setSecretReveal({
          name: created.name,
          token: created.token,
          triggerUrl: created.triggerUrl,
        });
      }

      setDialogOpen(false);
      resetForm();
      await fetchData();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to save webhook."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (webhook: Webhook) => {
    const confirmed = window.confirm(
      `Delete webhook '${webhook.name}'? Existing integrations using its URL will stop working immediately.`
    );
    if (!confirmed) {
      return;
    }

    setBusyWebhookId(webhook.id);
    setPageError("");
    try {
      await api.webhooks.delete(webhook.id);
      await fetchData();
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to delete webhook."
      );
    } finally {
      setBusyWebhookId(null);
    }
  };

  const handleRotateToken = async (webhook: Webhook) => {
    const confirmed = window.confirm(
      `Rotate token for '${webhook.name}'? The old trigger URL will stop working.`
    );
    if (!confirmed) {
      return;
    }

    setBusyWebhookId(webhook.id);
    setPageError("");
    try {
      const rotated = await api.webhooks.rotateToken(webhook.id);
      setSecretReveal({
        name: rotated.name,
        token: rotated.token,
        triggerUrl: rotated.triggerUrl,
      });
      await fetchData();
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to rotate webhook token."
      );
    } finally {
      setBusyWebhookId(null);
    }
  };

  const handleToggleActive = async (webhook: Webhook, active: boolean) => {
    setBusyWebhookId(webhook.id);
    setPageError("");
    try {
      await api.webhooks.update(webhook.id, { active });
      await fetchData();
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to update webhook."
      );
    } finally {
      setBusyWebhookId(null);
    }
  };

  const handleSendTestNotification = async (
    kind: "alert" | "resolved",
    source: "page" | "preview" = "page"
  ) => {
    setTestingNotificationKind(kind);
    setPageError("");
    setPageNotice("");
    if (source === "preview") {
      setPreviewActionError("");
      setPreviewActionMessage("");
    }

    try {
      const result = await api.webhooks.sendTestNotification(kind);
      setPageNotice(result.message);
      if (source === "preview") {
        setPreviewActionMessage(result.message);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to send test notification.";
      if (source === "preview") {
        setPreviewActionError(message);
      } else {
        setPageError(message);
      }
    } finally {
      setTestingNotificationKind(null);
    }
  };

  const handlePreviewTestNotification = async (
    kind: "alert" | "resolved"
  ) => {
    setPreviewingNotificationKind(kind);
    setPageError("");
    setPreviewActionError("");
    setPreviewActionMessage("");

    try {
      const preview = await api.webhooks.getTestNotificationPreview(kind);
      const previousPreview =
        testNotificationPreview?.kind === kind ? testNotificationPreview : null;
      const changedEntries = previousPreview
        ? collectChangedEntries(previousPreview.payload, preview.payload)
        : [];
      setTestNotificationPreview({
        ...preview,
        changedEntries,
        changedPaths: changedEntries.map((entry) => entry.path),
        generatedAt: extractGeneratedAt(preview.payload),
        payloadJson: JSON.stringify(preview.payload, null, 2),
        previousGeneratedAt: previousPreview?.generatedAt || null,
      });
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Failed to load test notification preview."
      );
    } finally {
      setPreviewingNotificationKind(null);
    }
  };

  const handleCopyTestNotificationPayload = async () => {
    if (!testNotificationPreview) {
      return;
    }

    await handleCopy(
      `${testNotificationPreview.kind} test payload`,
      testNotificationPreview.payloadJson
    );
  };

  const handleDownloadTestNotificationPayload = () => {
    if (!testNotificationPreview) {
      return;
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[:]/g, "-")
      .replace(/\.\d{3}Z$/, "Z");
    const blob = new Blob([testNotificationPreview.payloadJson], {
      type: "application/json;charset=utf-8",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `webhook-${testNotificationPreview.kind}-test-payload-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  };

  const handleJumpChangedPreviewLine = (direction: "previous" | "next") => {
    if (changedPreviewLineNumbers.length === 0) {
      return;
    }

    setShowOnlyChangedPreviewLines(false);
    setActiveChangedPreviewLineNumber((current) => {
      if (current === null) {
        return changedPreviewLineNumbers[0];
      }

      const currentIndex = changedPreviewLineNumbers.indexOf(current);
      if (currentIndex === -1) {
        return changedPreviewLineNumbers[0];
      }

      if (direction === "previous") {
        return changedPreviewLineNumbers[
          (currentIndex - 1 + changedPreviewLineNumbers.length) %
            changedPreviewLineNumbers.length
        ];
      }

      return changedPreviewLineNumbers[
        (currentIndex + 1) % changedPreviewLineNumbers.length
      ];
    });
  };

  const handleJumpToChangedPreviewPath = (path: string) => {
    const lineNumber = changedPreviewPathToLineNumber.get(path);
    if (!lineNumber) {
      return;
    }

    setShowOnlyChangedPreviewLines(false);
    setActiveChangedPreviewLineNumber(lineNumber);
  };

  const handleCopyChangedPreviewPath = async (path: string) => {
    await handleCopy("changed field path", path);
  };

  const handleToggleExpandedChangedPreviewPath = (path: string) => {
    setExpandedChangedPreviewPaths((current) =>
      current.includes(path)
        ? current.filter((value) => value !== path)
        : [...current, path]
    );
  };

  const handleExpandAllChangedPreviewPaths = () => {
    if (!testNotificationPreview) {
      return;
    }

    setExpandedChangedPreviewPaths(
      testNotificationPreview.changedEntries.map((entry) => entry.path)
    );
  };

  const handleCollapseAllChangedPreviewPaths = () => {
    setExpandedChangedPreviewPaths([]);
  };

  const handleTogglePinnedChangedPreviewPath = (path: string) => {
    setPinnedChangedPreviewPaths((current) => {
      if (current.includes(path)) {
        return current.filter((value) => value !== path);
      }

      setExpandedChangedPreviewPaths((expanded) =>
        expanded.includes(path) ? expanded : [...expanded, path]
      );
      return [...current, path];
    });
  };

  const handleAddPinnedChangedPreviewPrefix = (prefix: string) => {
    if (!testNotificationPreview) {
      return;
    }

    setPinnedChangedPreviewPrefixes((current) =>
      current.includes(prefix) ? current : [...current, prefix]
    );
    setExpandedChangedPreviewPaths((current) =>
      Array.from(
        new Set([
          ...current,
          ...testNotificationPreview.changedEntries
            .map((entry) => entry.path)
            .filter((path) => path.startsWith(prefix)),
        ])
      )
    );
  };

  const handleAddCustomPinnedChangedPreviewPrefix = () => {
    const normalizedPrefix = normalizePinnedChangedPreviewPrefix(
      customPinnedChangedPreviewPrefix
    );
    if (!normalizedPrefix) {
      setCustomPinnedChangedPreviewPrefixError(
        "Enter a non-empty prefix, for example runtimeHealth.cleanup."
      );
      return;
    }

    handleAddPinnedChangedPreviewPrefix(normalizedPrefix);
    setCustomPinnedChangedPreviewPrefix("");
    setCustomPinnedChangedPreviewPrefixError("");
  };

  const handleRemovePinnedChangedPreviewPrefix = (prefix: string) => {
    setPinnedChangedPreviewPrefixes((current) =>
      current.filter((value) => value !== prefix)
    );
  };

  const handleClearPinnedChangedPreviewPrefixes = () => {
    setPinnedChangedPreviewPrefixes([]);
  };

  const handleTogglePresetPinnedChangedPreviewRule = (
    presetId: string
  ) => {
    if (!testNotificationPreview) {
      return;
    }

    const preset: ChangedDiffPresetRule | undefined = CHANGED_DIFF_PRESET_RULES.find(
      (item) => item.id === presetId
    );
    if (!preset) {
      return;
    }

    const isActive =
      preset.prefixes.every((prefix) =>
        presetPinnedChangedPreviewPrefixes.includes(prefix)
      ) &&
      preset.paths.every((path) => presetPinnedChangedPreviewPaths.includes(path));

    if (isActive) {
      setPresetPinnedChangedPreviewPrefixes((current) =>
        current.filter((prefix) => !preset.prefixes.includes(prefix))
      );
      setPresetPinnedChangedPreviewPaths((current) =>
        current.filter((path) => !preset.paths.includes(path))
      );
      return;
    }

    setPresetPinnedChangedPreviewPrefixes((current) =>
      Array.from(new Set([...current, ...preset.prefixes]))
    );
    setPresetPinnedChangedPreviewPaths((current) =>
      Array.from(new Set([...current, ...preset.paths]))
    );
    setExpandedChangedPreviewPaths((current) =>
      Array.from(
        new Set([
          ...current,
          ...testNotificationPreview.changedEntries
            .map((entry) => entry.path)
            .filter(
              (path) =>
                preset.paths.includes(path) ||
                preset.prefixes.some((prefix) => path.startsWith(prefix))
            ),
        ])
      )
    );
  };

  const handleClearPresetPinnedChangedPreviewRules = () => {
    setPresetPinnedChangedPreviewPrefixes([]);
    setPresetPinnedChangedPreviewPaths([]);
  };

  const getChangedFieldsSummaryData = () => {
    if (!testNotificationPreview) {
      return null;
    }

    return {
      title: "Changed fields since last regeneration",
      kind: testNotificationPreview.kind,
      event: testNotificationPreview.event,
      from: formatTimestamp(testNotificationPreview.previousGeneratedAt),
      to: formatTimestamp(testNotificationPreview.generatedAt),
      changedEntries: testNotificationPreview.changedEntries,
      changedFieldCount: testNotificationPreview.changedEntries.length,
      changedPaths:
        testNotificationPreview.changedPaths.length > 0
          ? testNotificationPreview.changedPaths
          : ["No field-level changes detected."],
    };
  };

  const downloadTextFile = (content: string, filename: string) => {
    const blob = new Blob([content], {
      type: "text/plain;charset=utf-8",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  };

  const downloadJsonFile = (data: object, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  };

  const buildChangedFieldsSummaryFilename = (extension: "txt" | "json") => {
    const timestamp = (testNotificationPreview?.generatedAt || new Date().toISOString())
      .replace(/[:]/g, "-")
      .replace(/\.\d{3}Z$/, "Z");
    return `webhook-${testNotificationPreview?.kind || "preview"}-changed-fields-${timestamp}.${extension}`;
  };

  const handleCopyChangedFieldsSummary = async () => {
    const summaryData = getChangedFieldsSummaryData();
    if (!summaryData) {
      return;
    }

    const summaryLines = [
      summaryData.title,
      `Kind: ${summaryData.kind}`,
      `Event: ${summaryData.event}`,
      `From: ${summaryData.from}`,
      `To: ${summaryData.to}`,
      `Count: ${summaryData.changedFieldCount}`,
      "Fields:",
      ...(summaryData.changedEntries.length > 0
        ? summaryData.changedEntries.flatMap((entry) => [
            `- ${entry.path}`,
            `  previous: ${entry.previousExcerpt}`,
            `  next: ${entry.nextExcerpt}`,
          ])
        : ["- No field-level changes detected."]),
    ];

    await handleCopy("changed fields summary", summaryLines.join("\n"));
  };

  const handleDownloadChangedFieldsSummaryTxt = () => {
    const summaryData = getChangedFieldsSummaryData();
    if (!summaryData) {
      return;
    }

    const summaryLines = [
      summaryData.title,
      `Kind: ${summaryData.kind}`,
      `Event: ${summaryData.event}`,
      `From: ${summaryData.from}`,
      `To: ${summaryData.to}`,
      `Count: ${summaryData.changedFieldCount}`,
      "Fields:",
      ...(summaryData.changedEntries.length > 0
        ? summaryData.changedEntries.flatMap((entry) => [
            `- ${entry.path}`,
            `  previous: ${entry.previousExcerpt}`,
            `  next: ${entry.nextExcerpt}`,
          ])
        : ["- No field-level changes detected."]),
    ];

    downloadTextFile(
      summaryLines.join("\n"),
      buildChangedFieldsSummaryFilename("txt")
    );
  };

  const handleDownloadChangedFieldsSummaryJson = () => {
    const summaryData = getChangedFieldsSummaryData();
    if (!summaryData) {
      return;
    }

    downloadJsonFile(
      {
        ...summaryData,
        previousGeneratedAt: testNotificationPreview?.previousGeneratedAt || null,
        generatedAt: testNotificationPreview?.generatedAt || null,
      },
      buildChangedFieldsSummaryFilename("json")
    );
  };

  const loadDeliveries = useCallback(
    async (
      webhookId: string,
      options?: {
        append?: boolean;
        filter?: DeliveryFilter;
        timeRange?: DeliveryTimeRange;
      }
    ) => {
      const append = options?.append ?? false;
      const activeFilter =
        options?.filter ?? deliveryFilterByWebhook[webhookId] ?? "all";
      const activeTimeRange =
        options?.timeRange ?? deliveryTimeRangeByWebhook[webhookId] ?? {
          from: "",
          to: "",
        };
      const currentPage = deliveryPagesByWebhook[webhookId];
      const skip = append ? currentPage?.items.length ?? 0 : 0;

      if (append) {
        setLoadingMoreWebhookId(webhookId);
      } else {
        setLoadingDeliveryWebhookId(webhookId);
      }
      setPageError("");

      try {
        const page = await api.webhooks.listDeliveries(webhookId, {
          status: activeFilter === "all" ? undefined : activeFilter,
          from: datetimeLocalToIso(activeTimeRange.from),
          to: datetimeLocalToIso(activeTimeRange.to),
          skip,
          limit: DELIVERY_PAGE_SIZE,
        });

        setDeliveryPagesByWebhook((current) => {
          const existingItems = append ? current[webhookId]?.items ?? [] : [];
          const items = [...existingItems, ...page.items];

          return {
            ...current,
            [webhookId]: {
              ...page,
              items,
              skip: 0,
              hasMore: items.length < page.total,
            },
          };
        });
      } catch (error) {
        setPageError(
          error instanceof Error ? error.message : "Failed to load delivery logs."
        );
      } finally {
        if (append) {
          setLoadingMoreWebhookId(null);
        } else {
          setLoadingDeliveryWebhookId(null);
        }
      }
    },
    [deliveryFilterByWebhook, deliveryPagesByWebhook, deliveryTimeRangeByWebhook]
  );

  const toggleDeliveries = async (webhookId: string) => {
    if (expandedWebhookId === webhookId) {
      setExpandedWebhookId(null);
      return;
    }

    const nextFilter = deliveryFilterByWebhook[webhookId] || "all";
    const nextTimeRange = deliveryTimeRangeByWebhook[webhookId] || {
      from: "",
      to: "",
    };
    setDeliveryFilterByWebhook((current) => ({
      ...current,
      [webhookId]: nextFilter,
    }));
    setDeliveryTimeRangeByWebhook((current) => ({
      ...current,
      [webhookId]: nextTimeRange,
    }));
    setExpandedWebhookId(webhookId);
    await loadDeliveries(webhookId, {
      filter: nextFilter,
      timeRange: nextTimeRange,
    });
  };

  const handleDeliveryFilterChange = async (
    webhookId: string,
    filter: DeliveryFilter
  ) => {
    setDeliveryFilterByWebhook((current) => ({
      ...current,
      [webhookId]: filter,
    }));
    await loadDeliveries(webhookId, { filter });
  };

  const handleTimeRangeChange = (
    webhookId: string,
    field: keyof DeliveryTimeRange,
    value: string
  ) => {
    setDeliveryTimeRangeByWebhook((current) => ({
      ...current,
      [webhookId]: {
        from: current[webhookId]?.from || "",
        to: current[webhookId]?.to || "",
        [field]: value,
      },
    }));
  };

  const handleApplyTimeRange = async (webhookId: string) => {
    const nextTimeRange = deliveryTimeRangeByWebhook[webhookId] || {
      from: "",
      to: "",
    };
    await loadDeliveries(webhookId, { timeRange: nextTimeRange });
  };

  const handleClearTimeRange = async (webhookId: string) => {
    const clearedRange = { from: "", to: "" };
    setDeliveryTimeRangeByWebhook((current) => ({
      ...current,
      [webhookId]: clearedRange,
    }));
    await loadDeliveries(webhookId, { timeRange: clearedRange });
  };

  const handleExportDeliveries = async (webhookId: string) => {
    const activeFilter = deliveryFilterByWebhook[webhookId] || "all";
    const activeTimeRange = deliveryTimeRangeByWebhook[webhookId] || {
      from: "",
      to: "",
    };

    setExportingWebhookId(webhookId);
    setPageError("");

    try {
      const { blob, filename } = await api.webhooks.exportDeliveries(webhookId, {
        status: activeFilter === "all" ? undefined : activeFilter,
        from: datetimeLocalToIso(activeTimeRange.from),
        to: datetimeLocalToIso(activeTimeRange.to),
      });

      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename || `webhook-${webhookId}-deliveries.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Failed to export delivery logs."
      );
    } finally {
      setExportingWebhookId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Webhooks"
        description="Turn inbound events from Stripe, CRMs, forms, or internal systems into agent tasks."
        actions={
          <Button
            type="button"
            onClick={openCreateDialog}
            className="gradient-primary border-0 font-medium text-[#060e20] hover:opacity-90"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Webhook
          </Button>
        }
      />

      {secretReveal && (
        <div
          className="mb-6 rounded-3xl border border-[#7bd0ff33] p-5"
          style={{ background: "rgba(123, 208, 255, 0.08)" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-heading text-lg font-semibold text-foreground">
                Secret Revealed Once
              </p>
              <p className="mt-1 text-sm text-on-surface-dim">
                Save this token or trigger URL now. For security, the secret is
                not shown again after this view.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSecretReveal(null)}
              className="text-xs uppercase tracking-[0.08rem] text-on-surface-dim transition-colors hover:text-foreground"
            >
              Dismiss
            </button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl bg-surface-base p-4">
              <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                Webhook
              </p>
              <p className="mt-1 font-medium text-foreground">
                {secretReveal.name}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Input
                  value={secretReveal.token}
                  readOnly
                  className="border-0 bg-surface-container text-foreground"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleCopy("token", secretReveal.token)}
                  className="border-0 bg-surface-container text-foreground"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </Button>
              </div>
            </div>

            <div className="rounded-2xl bg-surface-base p-4">
              <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                Trigger URL
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Input
                  value={secretReveal.triggerUrl}
                  readOnly
                  className="border-0 bg-surface-container text-foreground"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleCopy("trigger URL", secretReveal.triggerUrl)}
                  className="border-0 bg-surface-container text-foreground"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </Button>
              </div>
            </div>
          </div>

          {copiedValue && (
            <p className="mt-3 text-sm text-accent-cyan">
              Copied {copiedValue}.
            </p>
          )}
        </div>
      )}

      {pageError && (
        <div
          className="mb-6 rounded-2xl px-4 py-3 text-sm"
          style={{
            background: "rgba(255, 180, 171, 0.12)",
            color: "#ffb4ab",
          }}
        >
          {pageError}
        </div>
      )}

      {pageNotice && (
        <div
          className="mb-6 rounded-2xl px-4 py-3 text-sm"
          style={{
            background: "rgba(20, 184, 166, 0.12)",
            color: "#5eead4",
          }}
        >
          {pageNotice}
        </div>
      )}

      <div className="mb-6 max-w-md">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: "var(--on-surface-dim)" }}
          />
          <Input
            placeholder="Search webhooks..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="border-0 bg-surface-container pl-10 pr-10 text-foreground placeholder:text-on-surface-dim"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-on-surface-dim transition-colors hover:bg-white/10 hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between px-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-dim opacity-70">
          {search ? (
            <>
              Found <span className="text-accent-cyan font-extrabold">{filteredWebhooks.length}</span> match{filteredWebhooks.length === 1 ? "" : "es"} for &quot;{search}&quot;
            </>
          ) : (
            <>
              Total <span className="text-accent-cyan font-extrabold">{webhooks.length}</span> webhooks
            </>
          )}
        </p>
      </div>

      <div
        className="mb-6 rounded-2xl border border-white/5 px-4 py-3 text-sm"
        style={{ background: "var(--surface-container)" }}
      >
        <span className="font-medium text-foreground">Production tip:</span>{" "}
        <span style={{ color: "var(--on-surface-dim)" }}>
          send an <code>X-Idempotency-Key</code> header so retries are deduped,
          then use the delivery log below to inspect accepted, duplicate, or
          failed webhook hits.
        </span>
      </div>

      {runtimeHealth && (
        <div className="mb-6 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <div
            className="rounded-3xl border border-white/5 p-5"
            style={{ background: "var(--surface-base)" }}
          >
            {runtimeHealth.deliveryBacklogAlert && (
              <div
                className="mb-4 rounded-2xl px-4 py-3 text-sm"
                style={{
                  background: "rgba(255, 180, 171, 0.12)",
                  color: "#ffb4ab",
                }}
              >
                <div className="font-medium">Cleanup attention required</div>
                <div className="mt-1">
                  {runtimeHealth.deliveryBacklogAlertMessage ||
                    "Expired delivery logs have been pending cleanup for longer than expected."}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-heading text-lg font-semibold text-foreground">
                  Runtime Health
                </p>
                <p className="mt-1 text-sm text-on-surface-dim">
                  Monitor cleanup cadence, retention backlog, and whether the
                  indexes needed for delivery lookups and retention are ready.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={fetchData}
                  className="border-0 bg-surface-container text-foreground"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh Health
                </Button>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08rem] ${
                    runtimeHealth.cleanup.lastStatus === "failed"
                      ? "bg-[#ffb4ab1a] text-[#ffb4ab]"
                      : runtimeHealth.cleanup.lastStatus === "success"
                        ? "bg-[#14b8a61a] text-[#5eead4]"
                        : "bg-white/5 text-on-surface-dim"
                  }`}
                >
                  {runtimeHealth.cleanup.lastStatus.replace("_", " ")}
                </span>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-surface-low p-4">
                <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                  Deliveries Retention
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {runtimeHealth.deliveryRetentionDays}d
                </p>
                <p className="mt-1 text-xs text-on-surface-dim">
                  {runtimeHealth.expiredDeliveriesPending} expired waiting for
                  cleanup
                </p>
              </div>

              <div className="rounded-2xl bg-surface-low p-4">
                <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                  Idempotency Retention
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {runtimeHealth.idempotencyRetentionDays}d
                </p>
                <p className="mt-1 text-xs text-on-surface-dim">
                  {runtimeHealth.expiredIdempotencyPending} expired waiting for
                  cleanup
                </p>
              </div>

              <div className="rounded-2xl bg-surface-low p-4">
                <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                  Cleanup Interval
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {runtimeHealth.cleanupIntervalHours}h
                </p>
                <p className="mt-1 text-xs text-on-surface-dim">
                  Next run {formatTimestamp(runtimeHealth.nextScheduledRunAt)}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-surface-container p-4">
                <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                  Cleanup Snapshot
                </p>
                <div className="mt-2 space-y-1 text-sm text-foreground">
                  <p>Last Run: {formatTimestamp(runtimeHealth.cleanup.lastRunAt)}</p>
                  <p>
                    Last Success: {formatTimestamp(runtimeHealth.cleanup.lastSuccessAt)}
                  </p>
                  <p>
                    Duration:{" "}
                    {runtimeHealth.cleanup.lastDurationMs != null
                      ? `${runtimeHealth.cleanup.lastDurationMs} ms`
                      : "Unknown"}
                  </p>
                  <p>
                    Deleted: {runtimeHealth.cleanup.deliveriesDeleted} deliveries,{" "}
                    {runtimeHealth.cleanup.idempotencyDeleted} idempotency claims
                  </p>
                </div>
                {runtimeHealth.cleanup.lastError && (
                  <p className="mt-3 text-sm text-[#ffb4ab]">
                    {runtimeHealth.cleanup.lastError}
                  </p>
                )}
              </div>

              <div className="rounded-2xl bg-surface-container p-4">
                <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                  Index Readiness
                </p>
                <div className="mt-3 space-y-2">
                  {[
                    {
                      label: "Delivery retention index",
                      ready: runtimeHealth.deliveryRetentionIndexReady,
                    },
                    {
                      label: "Idempotency retention index",
                      ready: runtimeHealth.idempotencyRetentionIndexReady,
                    },
                    {
                      label: "Delivery list index",
                      ready: runtimeHealth.deliveryListIndexReady,
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-3 rounded-xl bg-surface-low px-3 py-2"
                    >
                      <span className="text-sm text-foreground">{item.label}</span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08rem] ${
                          item.ready
                            ? "bg-[#14b8a61a] text-[#5eead4]"
                            : "bg-[#ffb4ab1a] text-[#ffb4ab]"
                        }`}
                      >
                        {item.ready ? "Ready" : "Missing"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {runtimeHealth.oldestExpiredDeliveryAt && (
              <div className="mt-4 rounded-2xl bg-surface-container p-4">
                <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                  Oldest Expired Delivery
                </p>
                <p className="mt-2 text-sm text-foreground">
                  {formatTimestamp(runtimeHealth.oldestExpiredDeliveryAt)}
                </p>
                <p className="mt-1 text-xs text-on-surface-dim">
                  Alert threshold: {runtimeHealth.deliveryBacklogAlertThresholdHours} hours since the last successful cleanup.
                </p>
              </div>
            )}
          </div>

          <div
            className="h-fit rounded-3xl border border-white/5 p-5 shadow-sm"
            style={{ background: "var(--surface-base)" }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-heading text-lg font-semibold text-foreground">
                  Alert Hook
                </h2>
                <p className="mt-1 text-sm text-on-surface-dim">
                  Sends backlog alerts to a configured webhook, which can point
                  to Slack incoming webhooks or an email-notification service.
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08rem] ${
                  !runtimeHealth.alerting.configured
                    ? "bg-white/5 text-on-surface-dim"
                    : runtimeHealth.alerting.lastStatus === "failed"
                      ? "bg-[#ffb4ab1a] text-[#ffb4ab]"
                      : runtimeHealth.alerting.lastStatus === "sent"
                        ? "bg-[#14b8a61a] text-[#5eead4]"
                        : "bg-[#7bd0ff14] text-accent-cyan"
                }`}
              >
                {runtimeHealth.alerting.lastStatus}
              </span>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={previewingNotificationKind !== null}
                onClick={() => handlePreviewTestNotification("alert")}
                className="border-0 bg-surface-container text-foreground disabled:opacity-50"
              >
                <Eye
                  className={`mr-2 h-4 w-4 ${
                    previewingNotificationKind === "alert"
                      ? "animate-pulse"
                      : ""
                  }`}
                />
                Preview Alert Payload
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={previewingNotificationKind !== null}
                onClick={() => handlePreviewTestNotification("resolved")}
                className="border-0 bg-surface-container text-foreground disabled:opacity-50"
              >
                <Eye
                  className={`mr-2 h-4 w-4 ${
                    previewingNotificationKind === "resolved"
                      ? "animate-pulse"
                      : ""
                  }`}
                />
                Preview Resolved Payload
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={
                  !runtimeHealth.alerting.configured ||
                  testingNotificationKind !== null
                }
                onClick={() => handleSendTestNotification("alert")}
                className="border-0 bg-surface-container text-foreground disabled:opacity-50"
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${
                    testingNotificationKind === "alert" ? "animate-spin" : ""
                  }`}
                />
                Send Test Alert
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={
                  !runtimeHealth.alerting.configured ||
                  testingNotificationKind !== null
                }
                onClick={() => handleSendTestNotification("resolved")}
                className="border-0 bg-surface-container text-foreground disabled:opacity-50"
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${
                    testingNotificationKind === "resolved"
                      ? "animate-spin"
                      : ""
                  }`}
                />
                Send Test Resolved
              </Button>
              {!runtimeHealth.alerting.configured && (
                <p className="mt-2 w-full text-xs text-on-surface-dim">
                  Configure <code>WEBHOOK_DELIVERY_BACKLOG_ALERT_WEBHOOK_URL</code>{" "}
                  on the backend to enable live tests.
                </p>
              )}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-surface-container p-4">
                <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                  Transport
                </p>
                <div className="mt-2 space-y-1 text-sm text-foreground">
                  <p>
                    {runtimeHealth.alerting.configured
                      ? `${runtimeHealth.alerting.transport} configured`
                      : "No alert webhook configured"}
                  </p>
                  <p>
                    Cooldown: {runtimeHealth.alerting.cooldownMinutes} minutes
                  </p>
                  <p>
                    Timeout: {runtimeHealth.alerting.timeoutSeconds} seconds
                  </p>
                  <p>
                    Incident:{" "}
                    {runtimeHealth.alerting.incidentOpen ? "Open" : "Clear"}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-surface-container p-4">
                <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                  Delivery Status
                </p>
                <div className="mt-2 space-y-1 text-sm text-foreground">
                  <p>
                    Last Attempt:{" "}
                    {formatTimestamp(runtimeHealth.alerting.lastAttemptAt)}
                  </p>
                  <p>
                    Last Sent: {formatTimestamp(runtimeHealth.alerting.lastSentAt)}
                  </p>
                </div>
                {runtimeHealth.alerting.lastError && (
                  <p className="mt-3 text-sm text-[#ffb4ab]">
                    {runtimeHealth.alerting.lastError}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3 rounded-2xl bg-surface-container p-4">
              <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                Resolved Notification
              </p>
              <div className="mt-2 grid items-start gap-4 md:grid-cols-[auto_1fr]">
                <span
                  className={`h-fit inline-flex w-fit rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08rem] ${
                    runtimeHealth.alerting.lastResolvedStatus === "sent"
                      ? "bg-[#14b8a61a] text-[#5eead4]"
                      : runtimeHealth.alerting.lastResolvedStatus === "failed"
                        ? "bg-[#ffb4ab1a] text-[#ffb4ab]"
                        : "bg-white/5 text-on-surface-dim"
                  }`}
                >
                  {runtimeHealth.alerting.lastResolvedStatus}
                </span>
                <div className="space-y-1 text-sm text-foreground">
                  <p>
                    Last Attempt:{" "}
                    {formatTimestamp(
                      runtimeHealth.alerting.lastResolvedAttemptAt
                    )}
                  </p>
                  <p>
                    Last Sent:{" "}
                    {formatTimestamp(runtimeHealth.alerting.lastResolvedSentAt)}
                  </p>
                </div>
              </div>
              {runtimeHealth.alerting.lastResolvedError && (
                <p className="mt-3 text-sm text-[#ffb4ab]">
                  {runtimeHealth.alerting.lastResolvedError}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm text-on-surface-dim">
          Loading webhooks...
        </div>
      ) : filteredWebhooks.length === 0 ? (
        <div
          className="rounded-3xl border border-white/5 py-20 text-center"
          style={{ background: "var(--surface-container)" }}
        >
          <WebhookIcon
            className="mx-auto mb-4 h-12 w-12"
            style={{ color: "var(--on-surface-dim)", opacity: 0.4 }}
          />
          <p className="mb-2 font-heading text-lg font-medium">
            No webhooks yet
          </p>
          <p className="mb-6 text-sm text-on-surface-dim">
            Create an inbound trigger so external systems can start agent work
            automatically.
          </p>
          <Button
            type="button"
            onClick={openCreateDialog}
            className="gradient-primary border-0 font-medium text-[#060e20] hover:opacity-90"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create First Webhook
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredWebhooks.map((webhook, index) => (
            (() => {
              const deliveryPage = deliveryPagesByWebhook[webhook.id];
              const deliveries = deliveryPage?.items || [];
              const activeFilter = deliveryFilterByWebhook[webhook.id] || "all";
              const activeTimeRange = deliveryTimeRangeByWebhook[webhook.id] || {
                from: "",
                to: "",
              };
              const totalDeliveries = deliveryPage?.total || 0;
              const hasMoreDeliveries = deliveryPage?.hasMore || false;
              const isLoadingInitial =
                loadingDeliveryWebhookId === webhook.id && !deliveryPage;
              const isRefreshing =
                loadingDeliveryWebhookId === webhook.id && Boolean(deliveryPage);
              const isLoadingMore = loadingMoreWebhookId === webhook.id;

              return (
                <div
                  key={webhook.id}
                  className="relative overflow-hidden rounded-3xl border border-white/5 p-5 animate-slide-in"
                  style={{
                    background: "var(--surface-base)",
                    animationDelay: `${index * 50}ms`,
                  }}
                >
                  <div
                    className="absolute inset-y-0 left-0 w-1"
                    style={{
                      background: webhook.active
                        ? "linear-gradient(180deg, #7bd0ff, #14b8a6)"
                        : "rgba(255,255,255,0.08)",
                    }}
                  />

                  <div className="ml-2 flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-heading text-lg font-semibold text-foreground">
                          {webhook.name}
                        </p>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08rem] ${
                            webhook.active
                              ? "bg-[#14b8a61a] text-[#5eead4]"
                              : "bg-white/5 text-on-surface-dim"
                          }`}
                        >
                          {webhook.active ? "Active" : "Paused"}
                        </span>
                      </div>

                      <p className="mt-2 line-clamp-2 text-sm text-on-surface-dim">
                        {webhook.description || "No description"}
                      </p>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl bg-surface-low p-3">
                          <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                            Agent
                          </p>
                          <p className="mt-1 flex items-center gap-2 text-sm text-foreground">
                            <Bot className="h-4 w-4 text-accent-cyan" />
                            {webhook.agentName || "Unknown agent"}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-surface-low p-3">
                          <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                            Task Title
                          </p>
                          <p className="mt-1 text-sm text-foreground">
                            {webhook.taskTitle}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="rounded-full bg-surface-low px-2.5 py-1 text-[11px] text-on-surface-dim">
                          Delegation: {webhook.allowDelegation ? "On" : "Off"}
                        </span>
                        <span className="rounded-full bg-surface-low px-2.5 py-1 text-[11px] text-on-surface-dim">
                          Approval: {webhook.requiresApproval ? "Required" : "Direct"}
                        </span>
                        <span className="rounded-full bg-surface-low px-2.5 py-1 text-[11px] text-on-surface-dim">
                          Last Trigger: {formatTimestamp(webhook.lastTriggeredAt)}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleDeliveries(webhook.id)}
                          className="inline-flex items-center gap-2 rounded-full bg-surface-low px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08rem] text-on-surface-dim transition-colors hover:text-accent-cyan"
                        >
                          <History className="h-3.5 w-3.5" />
                          {expandedWebhookId === webhook.id
                            ? "Hide Deliveries"
                            : "View Deliveries"}
                        </button>
                        {expandedWebhookId === webhook.id && (
                          <button
                            type="button"
                            onClick={() => loadDeliveries(webhook.id)}
                            className="inline-flex items-center gap-2 rounded-full bg-surface-low px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08rem] text-on-surface-dim transition-colors hover:text-accent-cyan"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Refresh
                          </button>
                        )}
                      </div>

                      {expandedWebhookId === webhook.id && (
                        <div
                          className="mt-4 rounded-2xl border border-white/5 p-4"
                          style={{ background: "var(--surface-low)" }}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-foreground">
                                Delivery Log
                              </p>
                              <p
                                className="mt-1 text-xs"
                                style={{ color: "var(--on-surface-dim)" }}
                              >
                                Server-filtered history for this webhook. Open a
                                delivery to inspect payload preview and runtime
                                metadata.
                              </p>
                            </div>
                            {isRefreshing && (
                              <span className="text-xs text-accent-cyan">
                                Refreshing...
                              </span>
                            )}
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            {DELIVERY_FILTER_OPTIONS.map((option) => {
                              const isActive = activeFilter === option.value;

                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() =>
                                    handleDeliveryFilterChange(
                                      webhook.id,
                                      option.value
                                    )
                                  }
                                  disabled={isRefreshing || isLoadingMore}
                                  className={`rounded-full px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08rem] transition-colors ${
                                    isActive
                                      ? "bg-[#7bd0ff14] text-accent-cyan"
                                      : "bg-surface-container text-on-surface-dim hover:text-accent-cyan"
                                  } disabled:opacity-60`}
                                >
                                  {option.label}
                                </button>
                              );
                            })}

                            <button
                              type="button"
                              onClick={() => loadDeliveries(webhook.id)}
                              disabled={isRefreshing || isLoadingMore}
                              className="inline-flex items-center gap-2 rounded-full bg-surface-container px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08rem] text-on-surface-dim transition-colors hover:text-accent-cyan disabled:opacity-60"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              Refresh
                            </button>

                            <button
                              type="button"
                              onClick={() => handleExportDeliveries(webhook.id)}
                              disabled={
                                isRefreshing ||
                                isLoadingMore ||
                                exportingWebhookId === webhook.id
                              }
                              className="inline-flex items-center gap-2 rounded-full bg-surface-container px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08rem] text-on-surface-dim transition-colors hover:text-accent-cyan disabled:opacity-60"
                            >
                              <Download className="h-3.5 w-3.5" />
                              {exportingWebhookId === webhook.id
                                ? "Exporting..."
                                : "Export CSV"}
                            </button>
                          </div>

                          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto_auto]">
                            <div>
                              <Label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08rem] text-on-surface-dim">
                                From
                              </Label>
                              <Input
                                type="datetime-local"
                                value={activeTimeRange.from}
                                onChange={(event) =>
                                  handleTimeRangeChange(
                                    webhook.id,
                                    "from",
                                    event.target.value
                                  )
                                }
                                className="border-0 bg-surface-container text-foreground"
                              />
                            </div>
                            <div>
                              <Label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08rem] text-on-surface-dim">
                                To
                              </Label>
                              <Input
                                type="datetime-local"
                                value={activeTimeRange.to}
                                onChange={(event) =>
                                  handleTimeRangeChange(
                                    webhook.id,
                                    "to",
                                    event.target.value
                                  )
                                }
                                className="border-0 bg-surface-container text-foreground"
                              />
                            </div>
                            <div className="flex items-end">
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => handleApplyTimeRange(webhook.id)}
                                disabled={isRefreshing || isLoadingMore}
                                className="w-full border-0 bg-surface-container text-foreground"
                              >
                                Apply Range
                              </Button>
                            </div>
                            <div className="flex items-end">
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => handleClearTimeRange(webhook.id)}
                                disabled={
                                  isRefreshing ||
                                  isLoadingMore ||
                                  (!activeTimeRange.from && !activeTimeRange.to)
                                }
                                className="w-full border-0 bg-surface-container text-foreground disabled:opacity-50"
                              >
                                Clear
                              </Button>
                            </div>
                          </div>

                          {deliveryPage && (
                            <div className="mt-3 text-xs text-on-surface-dim">
                              Showing {deliveries.length} of {totalDeliveries}{" "}
                              {activeFilter === "all"
                                ? "deliveries"
                                : `${activeFilter} deliveries`}
                              {deliveryPage.fromTime || deliveryPage.toTime ? (
                                <>
                                  {" "}
                                  for{" "}
                                  {deliveryPage.fromTime
                                    ? formatTimestamp(deliveryPage.fromTime)
                                    : "the beginning"}{" "}
                                  to{" "}
                                  {deliveryPage.toTime
                                    ? formatTimestamp(deliveryPage.toTime)
                                    : "now"}
                                </>
                              ) : null}
                              .
                            </div>
                          )}

                          {isLoadingInitial ? (
                            <div
                              className="mt-4 rounded-xl px-3 py-4 text-sm"
                              style={{
                                background: "var(--surface-container)",
                                color: "var(--on-surface-dim)",
                              }}
                            >
                              Fetching delivery logs...
                            </div>
                          ) : !deliveryPage || totalDeliveries === 0 ? (
                            <div
                              className="mt-4 rounded-xl px-3 py-4 text-sm"
                              style={{
                                background: "var(--surface-container)",
                                color: "var(--on-surface-dim)",
                              }}
                            >
                              {activeFilter === "all"
                                ? "No deliveries recorded yet."
                                : "No deliveries match the current filter."}
                            </div>
                          ) : (
                            <>
                              <div className="mt-4 space-y-3">
                                {deliveries.map((delivery) => (
                                  <div
                                    key={delivery.id}
                                    className="rounded-xl bg-surface-container p-3"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span
                                          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08rem] ${getDeliveryStatusClass(
                                            delivery.status
                                          )}`}
                                        >
                                          {delivery.status}
                                        </span>
                                        {delivery.duplicate && (
                                          <span className="rounded-full bg-[#7bd0ff14] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08rem] text-accent-cyan">
                                            duplicate
                                          </span>
                                        )}
                                        <span className="rounded-full bg-surface-low px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08rem] text-on-surface-dim">
                                          {delivery.requestMethod}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => setDebugDelivery(delivery)}
                                          className="inline-flex items-center gap-1 rounded-full bg-surface-low px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08rem] text-on-surface-dim transition-colors hover:text-accent-cyan"
                                        >
                                          <Eye className="h-3 w-3" />
                                          Debug
                                        </button>
                                        <span
                                          className="text-xs"
                                          style={{
                                            color: "var(--on-surface-dim)",
                                          }}
                                        >
                                          {formatTimestamp(delivery.receivedAt)}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="mt-3 grid gap-2 text-xs">
                                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                                        <div>
                                          <span
                                            style={{
                                              color: "var(--on-surface-dim)",
                                            }}
                                          >
                                            Task:
                                          </span>{" "}
                                          {delivery.taskId ? (
                                            <Link
                                              href={`/tasks/${delivery.taskId}`}
                                              className="font-medium text-accent-cyan hover:underline"
                                            >
                                              {delivery.taskId}
                                            </Link>
                                          ) : (
                                            <span className="text-foreground">
                                              Not created
                                            </span>
                                          )}
                                        </div>
                                        <div>
                                          <span
                                            style={{
                                              color: "var(--on-surface-dim)",
                                            }}
                                          >
                                            Type:
                                          </span>{" "}
                                          <span className="text-foreground">
                                            {delivery.contentType ||
                                              "Unknown content type"}
                                          </span>
                                        </div>
                                        <div>
                                          <span
                                            style={{
                                              color: "var(--on-surface-dim)",
                                            }}
                                          >
                                            Payload:
                                          </span>{" "}
                                          <span className="text-foreground">
                                            {delivery.payloadSizeBytes} bytes
                                          </span>
                                        </div>
                                      </div>

                                      <div>
                                        <span
                                          style={{
                                            color: "var(--on-surface-dim)",
                                          }}
                                        >
                                          Idempotency:
                                        </span>{" "}
                                        <span className="text-foreground">
                                          {delivery.idempotencyKey || "None"}
                                        </span>
                                      </div>

                                      {delivery.error && (
                                        <div className="text-[#ffb4ab]">
                                          {delivery.error}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {hasMoreDeliveries && (
                                <div className="mt-4 flex justify-center">
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() =>
                                      loadDeliveries(webhook.id, {
                                        append: true,
                                      })
                                    }
                                    disabled={isRefreshing || isLoadingMore}
                                    className="border-0 bg-surface-container text-foreground"
                                  >
                                    {isLoadingMore ? "Loading..." : "Load More"}
                                  </Button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Switch
                        checked={webhook.active}
                        onCheckedChange={(checked) =>
                          handleToggleActive(webhook, checked)
                        }
                        disabled={busyWebhookId === webhook.id}
                      />
                      <button
                        type="button"
                        onClick={() => openEditDialog(webhook)}
                        className="rounded-lg p-2 text-on-surface-dim transition-colors hover:bg-white/5 hover:text-accent-cyan"
                        aria-label={`Edit ${webhook.name}`}
                      >
                        <PencilLine className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRotateToken(webhook)}
                        disabled={busyWebhookId === webhook.id}
                        className="rounded-lg p-2 text-on-surface-dim transition-colors hover:bg-white/5 hover:text-accent-cyan disabled:opacity-50"
                        aria-label={`Rotate token for ${webhook.name}`}
                      >
                        <RotateCw className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(webhook)}
                        disabled={busyWebhookId === webhook.id}
                        className="rounded-lg p-2 text-on-surface-dim transition-colors hover:bg-white/5 hover:text-[#ffb4ab] disabled:opacity-50"
                        aria-label={`Delete ${webhook.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()
          ))}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            resetForm();
          }
        }}
      >
        <DialogContent
          className="sm:max-w-2xl max-h-[90vh] flex flex-col"
          style={{
            background: "var(--surface-high)",
            borderColor: "rgba(255,255,255,0.1)",
            borderWidth: "1px",
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading">
              <WebhookIcon className="h-5 w-5 text-accent-cyan" />
              {editingWebhook ? "Edit Webhook" : "New Webhook"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-5 py-2 md:grid-cols-2 overflow-y-auto custom-scrollbar flex-1 px-1">
            <div className="md:col-span-2">
              <Label className="mb-1.5 block text-sm font-medium text-foreground">
                Webhook Name
              </Label>
              <Input
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                placeholder="e.g. stripe-payment-succeeded"
                className="border-0 bg-surface-container text-foreground"
              />
            </div>

            <div className="md:col-span-2">
              <Label className="mb-1.5 block text-sm font-medium text-foreground">
                Description
              </Label>
              <Textarea
                value={formDescription}
                onChange={(event) => setFormDescription(event.target.value)}
                placeholder="What event source and payload this webhook represents"
                rows={3}
                className="border-0 bg-surface-container text-foreground resize-none"
              />
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-foreground">
                Agent
              </Label>
              <Select
                value={formAgentId}
                onValueChange={(value) => setFormAgentId(value || "")}
              >
                <SelectTrigger className="border-0 bg-surface-container text-foreground">
                  <SelectValue placeholder="Select an active agent" />
                </SelectTrigger>
                <SelectContent
                  style={{
                    background: "var(--surface-high)",
                    borderColor: "rgba(255,255,255,0.1)",
                  }}
                >
                  {agents.map((agent) => (
                    <SelectItem
                      key={agent.id}
                      value={agent.id}
                      className="text-foreground"
                    >
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-foreground">
                Task Title
              </Label>
              <Input
                value={formTaskTitle}
                onChange={(event) => setFormTaskTitle(event.target.value)}
                placeholder="e.g. Process Stripe payment event"
                className="border-0 bg-surface-container text-foreground"
              />
            </div>

            <div className="rounded-2xl bg-surface-container p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Allow Delegation
                  </p>
                  <p className="mt-1 text-xs text-on-surface-dim">
                    Let the assigned agent delegate the webhook task to child
                    agents when needed.
                  </p>
                </div>
                <Switch
                  checked={formAllowDelegation}
                  onCheckedChange={setFormAllowDelegation}
                />
              </div>
            </div>

            <div className="rounded-2xl bg-surface-container p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Requires Approval
                  </p>
                  <p className="mt-1 text-xs text-on-surface-dim">
                    Pause after the agent responds so a human can review before
                    completion.
                  </p>
                </div>
                <Switch
                  checked={formRequiresApproval}
                  onCheckedChange={setFormRequiresApproval}
                />
              </div>
            </div>

            <div className="rounded-2xl bg-surface-container p-4 md:col-span-2">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Active Immediately
                  </p>
                  <p className="mt-1 text-xs text-on-surface-dim">
                    Inactive webhooks stay configured but their trigger URLs
                    return not found until re-enabled.
                  </p>
                </div>
                <Switch checked={formActive} onCheckedChange={setFormActive} />
              </div>
            </div>
          </div>

          {formError && (
            <div
              className="rounded-xl px-3 py-2 text-sm"
              style={{
                background: "rgba(255, 180, 171, 0.12)",
                color: "#ffb4ab",
              }}
            >
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDialogOpen(false);
                resetForm();
              }}
              className="border-0 bg-surface-container text-foreground"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="gradient-primary border-0 font-medium text-[#060e20] hover:opacity-90"
            >
              {saving
                ? "Saving..."
                : editingWebhook
                  ? "Save Changes"
                  : "Create Webhook"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(testNotificationPreview)}
        onOpenChange={(open) => {
          if (!open) {
            setTestNotificationPreview(null);
            setShowOnlyChangedPreviewLines(false);
            setActiveChangedPreviewLineNumber(null);
            setExpandedChangedPreviewPaths([]);
            setPinnedChangedPreviewPaths([]);
            setCustomPinnedChangedPreviewPrefix("");
            setCustomPinnedChangedPreviewPrefixError("");
            setPreviewActionMessage("");
            setPreviewActionError("");
          }
        }}
      >
        <DialogContent
          className="sm:max-w-4xl max-h-[90vh] flex flex-col"
          style={{
            background: "var(--surface-high)",
            borderColor: "rgba(255,255,255,0.1)",
            borderWidth: "1px",
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading">
              <Eye className="h-5 w-5 text-accent-cyan" />
              {testNotificationPreview
                ? `Preview ${testNotificationPreview.kind} test payload`
                : "Preview test payload"}
            </DialogTitle>
          </DialogHeader>

          {testNotificationPreview && (
            <div className="grid gap-4 py-2 overflow-y-auto custom-scrollbar flex-1 px-1">
              <div className="rounded-2xl bg-surface-container p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                        Event
                      </p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {testNotificationPreview.event}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                        Generated
                      </p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {formatTimestamp(testNotificationPreview.generatedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        handlePreviewTestNotification(
                          testNotificationPreview.kind
                        )
                      }
                      disabled={previewingNotificationKind !== null}
                      className="border-0 bg-surface-low text-foreground disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`mr-2 h-4 w-4 ${
                          previewingNotificationKind ===
                          testNotificationPreview.kind
                            ? "animate-spin"
                            : ""
                        }`}
                      />
                      Regenerate Preview
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        handleSendTestNotification(
                          testNotificationPreview.kind,
                          "preview"
                        )
                      }
                      disabled={
                        !runtimeHealth?.alerting.configured ||
                        testingNotificationKind !== null
                      }
                      className="border-0 bg-surface-low text-foreground disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`mr-2 h-4 w-4 ${
                          testingNotificationKind ===
                          testNotificationPreview.kind
                            ? "animate-spin"
                            : ""
                        }`}
                      />
                      Send This Preview
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleCopyTestNotificationPayload}
                      className="border-0 bg-surface-low text-foreground"
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy JSON
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleDownloadTestNotificationPayload}
                      className="border-0 bg-surface-low text-foreground"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download JSON
                    </Button>
                  </div>
                </div>
                <p className="mt-3 text-sm text-on-surface-dim">
                  {testNotificationPreview.message}
                </p>
                {testNotificationPreview.previousGeneratedAt && (
                  <div className="mt-3 rounded-2xl bg-surface-low p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                          Changed Since Last Regeneration
                        </p>
                        <p className="mt-1 text-xs text-on-surface-dim">
                          Compared {formatTimestamp(testNotificationPreview.previousGeneratedAt)}{" "}
                          to {formatTimestamp(testNotificationPreview.generatedAt)}.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#7bd0ff14] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08rem] text-accent-cyan">
                          {testNotificationPreview.changedPaths.length} fields
                        </span>
                        <span className="rounded-full bg-[rgba(250,204,21,0.14)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08rem] text-[#fde68a]">
                          {pinnedChangedPreviewEntries.length} pinned
                        </span>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            handleAddPinnedChangedPreviewPrefix(
                              RUNTIME_HEALTH_PIN_PREFIX
                            )
                          }
                          disabled={
                            !testNotificationPreview.changedEntries.some((entry) =>
                              entry.path.startsWith(RUNTIME_HEALTH_PIN_PREFIX)
                            )
                          }
                          className="h-8 border-0 bg-surface-base px-3 text-foreground disabled:opacity-50"
                        >
                          Pin runtimeHealth.*
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleClearPinnedChangedPreviewPrefixes}
                          disabled={pinnedChangedPreviewPrefixes.length === 0}
                          className="h-8 border-0 bg-surface-base px-3 text-foreground disabled:opacity-50"
                        >
                          Clear Rule Pins
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleExpandAllChangedPreviewPaths}
                          disabled={testNotificationPreview.changedEntries.length === 0}
                          className="h-8 border-0 bg-surface-base px-3 text-foreground disabled:opacity-50"
                        >
                          Expand All
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleCollapseAllChangedPreviewPaths}
                          disabled={expandedChangedPreviewPaths.length === 0}
                          className="h-8 border-0 bg-surface-base px-3 text-foreground disabled:opacity-50"
                        >
                          Collapse All
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleCopyChangedFieldsSummary}
                          className="h-8 border-0 bg-surface-base px-3 text-foreground"
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Copy Changed Fields
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleDownloadChangedFieldsSummaryTxt}
                          className="h-8 border-0 bg-surface-base px-3 text-foreground"
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Export TXT
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleDownloadChangedFieldsSummaryJson}
                          className="h-8 border-0 bg-surface-base px-3 text-foreground"
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Export JSON
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 rounded-2xl bg-surface-container px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                            Saved Preset Rules
                          </p>
                          <p className="mt-1 text-xs text-on-surface-dim">
                            Quick pin groups for common webhook runtime fields.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleClearPresetPinnedChangedPreviewRules}
                          disabled={
                            presetPinnedChangedPreviewPrefixes.length === 0 &&
                            presetPinnedChangedPreviewPaths.length === 0
                          }
                          className="h-8 border-0 bg-surface-base px-3 text-foreground disabled:opacity-50"
                        >
                          Clear Presets
                        </Button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {CHANGED_DIFF_PRESET_RULES.map((preset) => {
                          const isActive =
                            preset.prefixes.every((prefix) =>
                              presetPinnedChangedPreviewPrefixes.includes(prefix)
                            ) &&
                            preset.paths.every((path) =>
                              presetPinnedChangedPreviewPaths.includes(path)
                            );

                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() =>
                                handleTogglePresetPinnedChangedPreviewRule(
                                  preset.id
                                )
                              }
                              className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
                                isActive
                                  ? "bg-[rgba(250,204,21,0.16)] text-[#fde68a]"
                                  : "bg-surface-base text-on-surface-dim hover:text-[#b7e6ff]"
                              }`}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-3 rounded-2xl bg-surface-container px-4 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                            Custom Auto-Pin Prefix
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Input
                              value={customPinnedChangedPreviewPrefix}
                              onChange={(event) => {
                                setCustomPinnedChangedPreviewPrefix(
                                  event.target.value
                                );
                                if (customPinnedChangedPreviewPrefixError) {
                                  setCustomPinnedChangedPreviewPrefixError("");
                                }
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  handleAddCustomPinnedChangedPreviewPrefix();
                                }
                              }}
                              placeholder="e.g. runtimeHealth.cleanup."
                              className="border-0 bg-surface-base text-foreground"
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={handleAddCustomPinnedChangedPreviewPrefix}
                              className="border-0 bg-surface-base text-foreground"
                            >
                              Add Auto-Pin Prefix
                            </Button>
                          </div>
                          <p className="mt-2 text-xs text-on-surface-dim">
                            Prefix rules are matched with <code>startsWith</code>. You can
                            type <code>*</code> at the end; it will be normalized automatically.
                          </p>
                          {customPinnedChangedPreviewPrefixError && (
                            <p className="mt-2 text-xs text-[#ffb4ab]">
                              {customPinnedChangedPreviewPrefixError}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {pinnedChangedPreviewPrefixes.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {pinnedChangedPreviewPrefixes.map((prefix) => (
                          <div
                            key={prefix}
                            className="inline-flex items-center overflow-hidden rounded-full bg-[rgba(250,204,21,0.14)]"
                          >
                            <span className="px-3 py-1.5 text-[11px] font-medium text-[#fde68a]">
                              Auto-pin: {prefix}*
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleRemovePinnedChangedPreviewPrefix(prefix)
                              }
                              className="border-l border-[rgba(250,204,21,0.2)] px-2.5 py-1.5 text-[#fde68a] transition-colors hover:bg-[rgba(123,208,255,0.18)] hover:text-[#b7e6ff]"
                              aria-label={`Remove auto-pin rule ${prefix}`}
                            >
                              <PinOff className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {testNotificationPreview.changedPaths.length > 0 ? (
                      <TooltipProvider>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {orderedChangedPreviewEntries.map((entry) => (
                            <div
                              key={entry.path}
                              className={`inline-flex items-center overflow-hidden rounded-full ${
                                isEffectivelyPinnedChangedPreviewPath(entry.path)
                                  ? "bg-[rgba(250,204,21,0.16)] ring-1 ring-[rgba(250,204,21,0.25)]"
                                  : "bg-[rgba(20,184,166,0.12)]"
                              }`}
                            >
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleJumpToChangedPreviewPath(entry.path)
                                      }
                                      className={`px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-[rgba(123,208,255,0.18)] hover:text-[#b7e6ff] ${
                                        isEffectivelyPinnedChangedPreviewPath(entry.path)
                                          ? "text-[#fde68a]"
                                          : "text-[#5eead4]"
                                      }`}
                                    />
                                  }
                                >
                                  {entry.path}
                                </TooltipTrigger>
                                <TooltipContent className="max-w-md whitespace-pre-wrap px-3 py-2 leading-5">
                                  <div className="space-y-2">
                                    <div>
                                      <p className="font-semibold text-background/80">
                                        Previous
                                      </p>
                                      <p>{entry.previousExcerpt}</p>
                                    </div>
                                    <div>
                                      <p className="font-semibold text-background/80">
                                        Next
                                      </p>
                                      <p>{entry.nextExcerpt}</p>
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                              <button
                                type="button"
                                onClick={() => handleCopyChangedPreviewPath(entry.path)}
                                className={`border-l px-2.5 py-1.5 transition-colors hover:bg-[rgba(123,208,255,0.18)] hover:text-[#b7e6ff] ${
                                  isEffectivelyPinnedChangedPreviewPath(entry.path)
                                    ? "border-[rgba(250,204,21,0.2)] text-[#fde68a]"
                                    : "border-[rgba(94,234,212,0.16)] text-[#5eead4]"
                                }`}
                                aria-label={`Copy path ${entry.path}`}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleTogglePinnedChangedPreviewPath(entry.path)
                                }
                                className={`border-l px-2.5 py-1.5 transition-colors hover:bg-[rgba(123,208,255,0.18)] hover:text-[#b7e6ff] ${
                                  isEffectivelyPinnedChangedPreviewPath(entry.path)
                                    ? "border-[rgba(250,204,21,0.2)] text-[#fde68a]"
                                    : "border-[rgba(94,234,212,0.16)] text-[#5eead4]"
                                }`}
                                aria-label={`Toggle pin for ${entry.path}`}
                              >
                                {isManuallyPinnedChangedPreviewPath(entry.path) ? (
                                  <PinOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Pin className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleExpandedChangedPreviewPath(entry.path)
                                }
                                className={`border-l px-2.5 py-1.5 transition-colors hover:bg-[rgba(123,208,255,0.18)] hover:text-[#b7e6ff] ${
                                  isEffectivelyPinnedChangedPreviewPath(entry.path)
                                    ? "border-[rgba(250,204,21,0.2)] text-[#fde68a]"
                                    : "border-[rgba(94,234,212,0.16)] text-[#5eead4]"
                                }`}
                                aria-label={`Toggle details for ${entry.path}`}
                              >
                                {expandedChangedPreviewPaths.includes(entry.path) ? (
                                  <ChevronUp className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      </TooltipProvider>
                    ) : (
                      <p className="mt-3 text-sm text-on-surface-dim">
                        No field-level changes detected.
                      </p>
                    )}

                    {expandedChangedPreviewEntries.length > 0 && (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {expandedChangedPreviewEntries.map((entry) => (
                          <div
                            key={entry.path}
                            className={`rounded-2xl px-4 py-3 ${
                              isEffectivelyPinnedChangedPreviewPath(entry.path)
                                ? "bg-[rgba(250,204,21,0.08)] ring-1 ring-[rgba(250,204,21,0.22)]"
                                : "bg-surface-container"
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-foreground">
                                  {entry.path}
                                </p>
                                {isEffectivelyPinnedChangedPreviewPath(entry.path) && (
                                  <span className="rounded-full bg-[rgba(250,204,21,0.16)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08rem] text-[#fde68a]">
                                    {isAutoPinnedChangedPreviewPath(entry.path) &&
                                    !isManuallyPinnedChangedPreviewPath(entry.path)
                                      ? "Auto-pinned"
                                      : "Pinned"}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() =>
                                    handleJumpToChangedPreviewPath(entry.path)
                                  }
                                  className="h-8 border-0 bg-surface-base px-3 text-foreground"
                                >
                                  Jump
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() =>
                                    handleTogglePinnedChangedPreviewPath(entry.path)
                                  }
                                  className="h-8 border-0 bg-surface-base px-3 text-foreground"
                                >
                                  {isManuallyPinnedChangedPreviewPath(entry.path)
                                    ? "Unpin"
                                    : "Pin"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() =>
                                    handleToggleExpandedChangedPreviewPath(entry.path)
                                  }
                                  className="h-8 border-0 bg-surface-base px-3 text-foreground"
                                >
                                  Collapse
                                </Button>
                              </div>
                            </div>

                            <div className="mt-3 space-y-3">
                              <div className="rounded-xl bg-surface-low px-3 py-2">
                                <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                                  Previous
                                </p>
                                <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-xs text-foreground">
                                  {entry.previousExcerpt}
                                </pre>
                              </div>
                              <div className="rounded-xl bg-surface-low px-3 py-2">
                                <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                                  Next
                                </p>
                                <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-xs text-foreground">
                                  {entry.nextExcerpt}
                                </pre>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {!runtimeHealth?.alerting.configured && (
                  <p className="mt-3 text-xs text-on-surface-dim">
                    Configure <code>WEBHOOK_DELIVERY_BACKLOG_ALERT_WEBHOOK_URL</code>{" "}
                    to send this preview to Slack or your notification webhook.
                  </p>
                )}
                {previewActionError && (
                  <div
                    className="mt-3 rounded-2xl px-3 py-2 text-sm"
                    style={{
                      background: "rgba(255, 180, 171, 0.12)",
                      color: "#ffb4ab",
                    }}
                  >
                    {previewActionError}
                  </div>
                )}
                {previewActionMessage && (
                  <div
                    className="mt-3 rounded-2xl px-3 py-2 text-sm"
                    style={{
                      background: "rgba(20, 184, 166, 0.12)",
                      color: "#5eead4",
                    }}
                  >
                    {previewActionMessage}
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-surface-container p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                      Payload
                    </p>
                    <p className="mt-1 text-xs text-on-surface-dim">
                      Exact JSON generated by the backend for this manual test.
                      Changed lines are highlighted after regeneration.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 rounded-full bg-surface-low px-3 py-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleJumpChangedPreviewLine("previous")}
                        disabled={changedPreviewLineNumbers.length === 0}
                        className="h-8 border-0 bg-surface-base px-3 text-foreground disabled:opacity-50"
                      >
                        Previous Changed
                      </Button>
                      <span className="min-w-[56px] text-center text-[11px] font-medium uppercase tracking-[0.08rem] text-on-surface-dim">
                        {changedPreviewLineNumbers.length === 0 ||
                        activeChangedPreviewLineNumber === null
                          ? "0 / 0"
                          : `${changedPreviewLineNumbers.indexOf(
                              activeChangedPreviewLineNumber
                            ) + 1} / ${changedPreviewLineNumbers.length}`}
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleJumpChangedPreviewLine("next")}
                        disabled={changedPreviewLineNumbers.length === 0}
                        className="h-8 border-0 bg-surface-base px-3 text-foreground disabled:opacity-50"
                      >
                        Next Changed
                      </Button>
                    </div>
                    <div className="flex items-center gap-3 rounded-full bg-surface-low px-3 py-2">
                      <span className="text-[11px] font-medium uppercase tracking-[0.08rem] text-on-surface-dim">
                        Show Only Changed Lines
                      </span>
                      <Switch
                        checked={showOnlyChangedPreviewLines}
                        onCheckedChange={setShowOnlyChangedPreviewLines}
                        disabled={!testNotificationPreview.previousGeneratedAt}
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-4 max-h-[420px] overflow-auto rounded-2xl bg-surface-base">
                  {showOnlyChangedPreviewLines &&
                  visiblePreviewPayloadLines.length === 0 ? (
                    <div className="px-4 py-4 text-sm text-on-surface-dim">
                      {testNotificationPreview.previousGeneratedAt
                        ? "No changed lines detected in the latest regeneration."
                        : "Regenerate the preview once to isolate only changed lines."}
                    </div>
                  ) : (
                    <div className="min-w-full py-2">
                      {visiblePreviewPayloadLines.map((line) => (
                        <div
                          key={`${line.lineNumber}-${line.content}`}
                          ref={(element) => {
                            previewPayloadLineRefs.current[line.lineNumber] =
                              element;
                          }}
                          className={`flex ${
                            activeChangedPreviewLineNumber === line.lineNumber
                              ? "bg-[rgba(123,208,255,0.18)] ring-1 ring-[rgba(123,208,255,0.35)]"
                              : line.changed
                                ? "bg-[rgba(20,184,166,0.12)]"
                                : ""
                          }`}
                        >
                          <div
                            className={`w-12 shrink-0 border-r px-3 py-1 text-right font-mono text-[10px] leading-6 ${
                              activeChangedPreviewLineNumber === line.lineNumber
                                ? "border-[rgba(123,208,255,0.28)] text-[#7bd0ff]"
                                : line.changed
                                  ? "border-[rgba(94,234,212,0.2)] text-[#5eead4]"
                                  : "border-white/5 text-on-surface-dim"
                            }`}
                          >
                            {line.lineNumber}
                          </div>
                          <pre
                            className={`flex-1 whitespace-pre-wrap break-all px-4 py-1 font-mono text-xs leading-6 ${
                              activeChangedPreviewLineNumber === line.lineNumber
                                ? "text-[#b7e6ff]"
                                : line.changed
                                  ? "text-[#5eead4]"
                                  : "text-foreground"
                            }`}
                          >
                            {line.content}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(debugDelivery)}
        onOpenChange={(open) => {
          if (!open) {
            setDebugDelivery(null);
          }
        }}
      >
        <DialogContent
          className="sm:max-w-3xl max-h-[90vh] flex flex-col"
          style={{
            background: "var(--surface-high)",
            borderColor: "rgba(255,255,255,0.1)",
            borderWidth: "1px",
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading">
              <Eye className="h-5 w-5 text-accent-cyan" />
              Delivery Debug View
            </DialogTitle>
          </DialogHeader>

          {debugDelivery && (
            <div className="grid gap-4 py-2 overflow-y-auto custom-scrollbar flex-1 px-1">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-surface-container p-4">
                  <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                    Status
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08rem] ${getDeliveryStatusClass(
                        debugDelivery.status
                      )}`}
                    >
                      {debugDelivery.status}
                    </span>
                    {debugDelivery.duplicate && (
                      <span className="rounded-full bg-[#7bd0ff14] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08rem] text-accent-cyan">
                        duplicate
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-sm text-on-surface-dim">
                    Received {formatTimestamp(debugDelivery.receivedAt)}
                  </p>
                </div>

                <div className="rounded-2xl bg-surface-container p-4">
                  <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                    Runtime
                  </p>
                  <div className="mt-2 space-y-2 text-sm text-foreground">
                    <p>Method: {debugDelivery.requestMethod}</p>
                    <p>Content-Type: {debugDelivery.contentType || "Unknown"}</p>
                    <p>Payload Size: {debugDelivery.payloadSizeBytes} bytes</p>
                    <p>
                      Idempotency: {debugDelivery.idempotencyKey || "None"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-surface-container p-4">
                <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                  Task
                </p>
                <div className="mt-2 text-sm text-foreground">
                  {debugDelivery.taskId ? (
                    <Link
                      href={`/tasks/${debugDelivery.taskId}`}
                      className="font-medium text-accent-cyan hover:underline"
                    >
                      {debugDelivery.taskId}
                    </Link>
                  ) : (
                    "No task created"
                  )}
                </div>
              </div>

              {debugDelivery.error && (
                <div
                  className="rounded-2xl px-4 py-3 text-sm"
                  style={{
                    background: "rgba(255, 180, 171, 0.12)",
                    color: "#ffb4ab",
                  }}
                >
                  {debugDelivery.error}
                </div>
              )}

              <div className="rounded-2xl bg-surface-container p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.08rem] text-on-surface-dim">
                      Payload Preview
                    </p>
                    <p className="mt-1 text-xs text-on-surface-dim">
                      Stored preview for debugging delivery issues.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      handleCopy(
                        "payload preview",
                        debugDelivery.payloadPreview || ""
                      )
                    }
                    disabled={!debugDelivery.payloadPreview}
                    className="border-0 bg-surface-low text-foreground disabled:opacity-50"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Payload
                  </Button>
                </div>

                <pre className="mt-4 max-h-[360px] overflow-auto rounded-2xl bg-surface-base p-4 text-xs leading-6 text-foreground whitespace-pre-wrap break-words">
                  {debugDelivery.payloadPreview || "No payload preview captured."}
                </pre>

                {debugDelivery.payloadTruncated && (
                  <p className="mt-3 text-xs text-on-surface-dim">
                    Preview truncated for storage safety. Full payload is not
                    retained in delivery logs.
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
