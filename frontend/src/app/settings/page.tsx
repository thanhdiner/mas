"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Settings as SettingsIcon,
  Cpu,
  Key,
  Eye,
  EyeOff,
  Save,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Zap,
  Globe,
  Layers,
  RotateCcw,
  Shield,
} from "lucide-react";
import { api } from "@/lib/api";
import type { LLMSettings, GeneralSettings, LLMModel } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    field: "openai_api_key" as const,
    setField: "openai_api_key_set" as const,
    hintField: "openai_api_key_hint" as const,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 flex-shrink-0" style={{ color: "#10a37f" }}>
        <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.073zm-9.022 12.108a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-2.1466zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.0993 3.8558L12.5973 8.3829v-2.3323a.0757.0757 0 0 1 .0332-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66v5.5826a.7948.7948 0 0 1-.3927.6812l-4.7783 2.763c-.0236.0142-.0568.0142-.0804 0zM8.3065 12.863l-2.02-1.1686a.071.071 0 0 1-.038-.052V6.06A4.504 4.504 0 0 1 10.743 1.5654a4.4755 4.4755 0 0 1 2.8764 1.0408l-.1419.0804-4.7783 2.7582a.7948.7948 0 0 0-.3927.6813zm10.9318-3.0137l-.142-.0852-4.783-2.7582a.7712.7712 0 0 0-.7806 0L7.6899 10.374v-2.3324a.0804.0804 0 0 1 .0332-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802-4.66zM15.4266 10.224l-3.3543-1.936-3.3543 1.936v3.872l3.3543 1.936 3.3543-1.936z"/>
      </svg>
    ),
    color: "#10a37f",
    placeholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    field: "anthropic_api_key" as const,
    setField: "anthropic_api_key_set" as const,
    hintField: "anthropic_api_key_hint" as const,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 flex-shrink-0" style={{ color: "#d97757" }}>
        <path d="M11 2L2 22H5.5L8.5 15H15.5L18.5 22H22L13 2H11ZM10 11.5L12 7L14 11.5H10Z" />
      </svg>
    ),
    color: "#d97757",
    placeholder: "sk-ant-...",
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    field: "gemini_api_key" as const,
    setField: "gemini_api_key_set" as const,
    hintField: "gemini_api_key_hint" as const,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 flex-shrink-0" style={{ color: "#4285f4" }}>
        <path d="M12 0C12 6.627 17.373 12 24 12C17.373 12 12 17.373 12 24C12 17.373 6.627 12 0 12C6.627 12 12 6.627 12 0Z" />
      </svg>
    ),
    color: "#4285f4",
    placeholder: "AIza...",
    docsUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    field: "deepseek_api_key" as const,
    setField: "deepseek_api_key_set" as const,
    hintField: "deepseek_api_key_hint" as const,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 flex-shrink-0" style={{ color: "#1d4ed8" }}>
        <path d="M12 21C7.029 21 3 16.971 3 12h5a4 4 0 1 0 8 0h5C21 16.971 16.971 21 12 21zm9-11H3C3 5.029 7.029 1 12 1s9 4.029 9 9z" />
      </svg>
    ),
    color: "#1d4ed8",
    placeholder: "sk-...",
    docsUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "groq",
    name: "Groq",
    field: "groq_api_key" as const,
    setField: "groq_api_key_set" as const,
    hintField: "groq_api_key_hint" as const,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 flex-shrink-0" style={{ color: "#f55036" }}>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <path d="M15 12H9M15 12L12 9M15 12L12 15" stroke="var(--surface-lowest)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    ),
    color: "#f55036",
    placeholder: "gsk_...",
    docsUrl: "https://console.groq.com/keys",
  },
  {
    id: "together",
    name: "Together AI",
    field: "together_api_key" as const,
    setField: "together_api_key_set" as const,
    hintField: "together_api_key_hint" as const,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 flex-shrink-0" style={{ color: "#0ea5e9" }}>
        <path d="M16 16c2.21 0 4-1.79 4-4s-1.79-4-4-4c-2.21 0-3.315 2-4 4-1.315 2-2.21 4-4 4s-4-1.79-4-4 1.79-4 4-4c2.21 0 3.315 2 4 4" />
      </svg>
    ),
    color: "#0ea5e9",
    placeholder: "...",
    docsUrl: "https://api.together.xyz/settings/api-keys",
  },
];

type StatusMsg = { type: "success" | "error"; text: string } | null;

export default function SettingsPage() {
  // ─── Loading ───────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);

  // ─── LLM State ─────────────────────────────────────────────────
  const [llm, setLlm] = useState<LLMSettings | null>(null);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [keyVisibility, setKeyVisibility] = useState<Record<string, boolean>>(
    {}
  );
  const [defaultProvider, setDefaultProvider] = useState("openai");
  const [defaultModel, setDefaultModel] = useState("gpt-4o-mini");
  const [savingLlm, setSavingLlm] = useState(false);
  const [llmMsg, setLlmMsg] = useState<StatusMsg>(null);
  const [availableModels, setAvailableModels] = useState<LLMModel[]>([]);

  // ─── General State ─────────────────────────────────────────────
  const [general, setGeneral] = useState<GeneralSettings | null>(null);
  const [appName, setAppName] = useState("");
  const [maxDepth, setMaxDepth] = useState(5);
  const [maxSteps, setMaxSteps] = useState(10);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [generalMsg, setGeneralMsg] = useState<StatusMsg>(null);

  // ─── Active Tab ────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"llm" | "general">("llm");

  // ─── Load Data ─────────────────────────────────────────────────
  const loadSettings = useCallback(async () => {
    try {
      const [llmData, generalData, modelsData] = await Promise.all([
        api.settings.getLLM(),
        api.settings.getGeneral(),
        api.playground.models(),
      ]);
      setLlm(llmData);
      setDefaultProvider(llmData.default_provider);
      setDefaultModel(llmData.default_model);
      setGeneral(generalData);
      setAppName(generalData.app_name);
      setMaxDepth(generalData.max_delegation_depth);
      setMaxSteps(generalData.max_steps_default);
      setAvailableModels(modelsData);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // ─── LLM Save ──────────────────────────────────────────────────
  const handleSaveLlm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLlm(true);
    setLlmMsg(null);

    try {
      const payload: Record<string, string | null> = {
        default_provider: defaultProvider,
        default_model: defaultModel,
      };
      // Only send keys that have been touched
      for (const p of PROVIDERS) {
        if (keyInputs[p.id] !== undefined) {
          payload[p.field] = keyInputs[p.id];
        }
      }

      const updated = await api.settings.updateLLM(payload);
      setLlm(updated);
      setKeyInputs({}); // Clear touched inputs
      setLlmMsg({ type: "success", text: "LLM settings saved successfully" });
    } catch (err: unknown) {
      setLlmMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save LLM settings",
      });
    } finally {
      setSavingLlm(false);
    }
  };

  // ─── General Save ──────────────────────────────────────────────
  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGeneral(true);
    setGeneralMsg(null);

    try {
      const updated = await api.settings.updateGeneral({
        app_name: appName,
        max_delegation_depth: maxDepth,
        max_steps_default: maxSteps,
      });
      setGeneral(updated);
      setGeneralMsg({
        type: "success",
        text: "General settings saved successfully",
      });
    } catch (err: unknown) {
      setGeneralMsg({
        type: "error",
        text:
          err instanceof Error ? err.message : "Failed to save general settings",
      });
    } finally {
      setSavingGeneral(false);
    }
  };

  // ─── Clear a key ───────────────────────────────────────────────
  const handleClearKey = async (providerId: string, field: string) => {
    setSavingLlm(true);
    setLlmMsg(null);
    try {
      const payload: Record<string, string> = { [field]: "" };
      const updated = await api.settings.updateLLM(payload);
      setLlm(updated);
      setKeyInputs((prev) => {
        const next = { ...prev };
        delete next[providerId];
        return next;
      });
      setLlmMsg({ type: "success", text: "API key cleared" });
    } catch (err: unknown) {
      setLlmMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to clear key",
      });
    } finally {
      setSavingLlm(false);
    }
  };

  if (loading) {
    return (
      <div
        className="flex items-center justify-center py-20 text-sm"
        style={{ color: "var(--on-surface-dim)" }}
      >
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading settings...
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Configure LLM providers, API keys, and system preferences"
      />

      {/* Tab Switcher */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("llm")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
            activeTab === "llm"
              ? "bg-accent-cyan/15 text-accent-cyan shadow-sm"
              : "text-on-surface-dim hover:text-foreground hover:bg-surface-container"
          }`}
        >
          <Cpu className="w-4 h-4" />
          LLM Providers
        </button>
        <button
          onClick={() => setActiveTab("general")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
            activeTab === "general"
              ? "bg-accent-cyan/15 text-accent-cyan shadow-sm"
              : "text-on-surface-dim hover:text-foreground hover:bg-surface-container"
          }`}
        >
          <SettingsIcon className="w-4 h-4" />
          General
        </button>
      </div>

      {/* ═══════════════════════ LLM Tab ═══════════════════════ */}
      {activeTab === "llm" && (
        <div className="max-w-5xl space-y-6 md:space-y-0 md:grid md:grid-cols-12 md:gap-6 w-full mb-10">
          {/* Left: Status Overview */}
          <div className="md:col-span-4 lg:col-span-4 space-y-6">
            {/* Provider Status */}
            <div
              className="rounded-2xl p-6 shadow-sm"
              style={{ background: "var(--surface-container)" }}
            >
              <h3 className="text-sm font-heading font-semibold text-foreground mb-4 flex items-center gap-2">
                <Shield className="w-4 h-4 text-accent-cyan" />
                Provider Status
              </h3>
              <div className="space-y-3">
                {PROVIDERS.map((p) => {
                  const isSet = llm?.[p.setField] ?? false;
                  return (
                    <div
                      key={p.id}
                      className="rounded-xl p-3.5 flex items-center gap-3"
                      style={{ background: "var(--surface-lowest)" }}
                    >
                      <span className="text-lg">{p.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {p.name}
                        </p>
                        {isSet ? (
                          <p className="text-[11px] font-mono" style={{ color: "#4edea3" }}>
                            {llm?.[p.hintField] || "Configured"}
                          </p>
                        ) : (
                          <p className="text-[11px]" style={{ color: "var(--on-surface-dim)" }}>
                            Not configured
                          </p>
                        )}
                      </div>
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          background: isSet ? "#4edea3" : "var(--on-surface-dim)",
                          opacity: isSet ? 1 : 0.3,
                          boxShadow: isSet ? "0 0 8px rgba(78,222,163,.4)" : "none",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Default Model Info */}
            <div
              className="rounded-2xl p-6 shadow-sm"
              style={{ background: "var(--surface-container)" }}
            >
              <h3 className="text-sm font-heading font-semibold text-foreground mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-accent-cyan" />
                Active Defaults
              </h3>
              <div className="space-y-3">
                <InfoTile label="Provider" value={llm?.default_provider || "openai"} />
                <InfoTile label="Model" value={llm?.default_model || "gpt-4o-mini"} mono />
              </div>
            </div>
          </div>

          {/* Right: Forms */}
          <div className="md:col-span-8 lg:col-span-8 space-y-6">
            {/* Default Model/Provider */}
            <div
              className="rounded-2xl p-6"
              style={{ background: "var(--surface-container)" }}
            >
              <h3 className="text-sm font-heading font-semibold text-foreground mb-5 flex items-center gap-2">
                <Globe className="w-4 h-4 text-accent-cyan" />
                Default Model Configuration
              </h3>
              <form onSubmit={handleSaveLlm}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="defaultProvider"
                      className="text-[11px] uppercase tracking-[0.05rem]"
                      style={{ color: "var(--on-surface-dim)" }}
                    >
                      Default Provider
                    </Label>
                    <select
                      id="defaultProvider"
                      value={defaultProvider}
                      onChange={(e) => {
                        const newProvider = e.target.value;
                        setDefaultProvider(newProvider);
                        const firstModel = availableModels.find(
                          (m) => m.provider === newProvider
                        );
                        if (firstModel) {
                          setDefaultModel(firstModel.id);
                        }
                      }}
                      className="w-full h-11 px-3 rounded-lg text-sm bg-surface-lowest text-foreground border-0 outline-none focus:ring-2 focus:ring-accent-cyan/30"
                      style={{ background: "var(--surface-lowest)", color: "var(--foreground)" }}
                    >
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="gemini">Google Gemini</option>
                      <option value="deepseek">DeepSeek</option>
                      <option value="groq">Groq</option>
                      <option value="together">Together AI</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="defaultModel"
                      className="text-[11px] uppercase tracking-[0.05rem]"
                      style={{ color: "var(--on-surface-dim)" }}
                    >
                      Default Model
                    </Label>
                    <select
                      id="defaultModel"
                      value={defaultModel}
                      onChange={(e) => setDefaultModel(e.target.value)}
                      className="w-full h-11 px-3 rounded-lg text-sm bg-surface-lowest text-foreground border-0 outline-none focus:ring-2 focus:ring-accent-cyan/30"
                      style={{ background: "var(--surface-lowest)", color: "var(--foreground)" }}
                    >
                      {availableModels
                        .filter((m) => m.provider === defaultProvider)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.id})
                          </option>
                        ))}
                      {availableModels.filter((m) => m.provider === defaultProvider).length === 0 && (
                        <option value={defaultModel}>{defaultModel}</option>
                      )}
                    </select>
                  </div>
                </div>

                {llmMsg && (
                  <div
                    className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${
                      llmMsg.type === "success"
                        ? "text-[#4edea3]"
                        : "text-[#ffb4ab]"
                    }`}
                    style={{
                      background:
                        llmMsg.type === "success"
                          ? "rgba(78, 222, 163, 0.1)"
                          : "rgba(255, 180, 171, 0.1)",
                    }}
                  >
                    {llmMsg.type === "success" ? (
                      <CheckCircle className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                    )}
                    {llmMsg.text}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={savingLlm}
                  className="gradient-primary text-[#060e20] font-medium border-0 hover:opacity-90 px-6"
                >
                  {savingLlm ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save Defaults
                </Button>
              </form>
            </div>

            {/* API Key Cards */}
            <div
              className="rounded-2xl p-6"
              style={{ background: "var(--surface-container)" }}
            >
              <h3 className="text-sm font-heading font-semibold text-foreground mb-5 flex items-center gap-2">
                <Key className="w-4 h-4 text-accent-cyan" />
                API Keys
              </h3>
              <p
                className="text-xs mb-5"
                style={{ color: "var(--on-surface-dim)" }}
              >
                API keys are encrypted at rest. Keys set here take priority over
                values in <code className="text-accent-cyan/80">.env</code>.
              </p>
              <div className="space-y-4">
                {PROVIDERS.map((p) => {
                  const isSet = llm?.[p.setField] ?? false;
                  const hint = llm?.[p.hintField] ?? "";
                  const inputVal = keyInputs[p.id];
                  const isVisible = keyVisibility[p.id] ?? false;
                  const isTouched = inputVal !== undefined;

                  return (
                    <div
                      key={p.id}
                      className="rounded-xl p-4 border transition-all"
                      style={{
                        background: "var(--surface-lowest)",
                        borderColor: isSet
                          ? "rgba(78,222,163,.15)"
                          : "transparent",
                      }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{p.icon}</span>
                          <span className="text-sm font-semibold text-foreground">
                            {p.name}
                          </span>
                          {isSet && (
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                              style={{
                                background: "rgba(78,222,163,.12)",
                                color: "#4edea3",
                              }}
                            >
                              Active
                            </span>
                          )}
                        </div>
                        <a
                          href={p.docsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-accent-cyan hover:underline"
                        >
                          Get key →
                        </a>
                      </div>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            type={isVisible ? "text" : "password"}
                            value={
                              isTouched
                                ? inputVal
                                : isSet
                                  ? `${"•".repeat(20)}${hint}`
                                  : ""
                            }
                            onChange={(e) =>
                              setKeyInputs((prev) => ({
                                ...prev,
                                [p.id]: e.target.value,
                              }))
                            }
                            onFocus={() => {
                              if (!isTouched && isSet) {
                                setKeyInputs((prev) => ({
                                  ...prev,
                                  [p.id]: "",
                                }));
                              }
                            }}
                            placeholder={p.placeholder}
                            className="bg-surface-lowest border-0 text-foreground h-10 pr-10 font-mono text-xs"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setKeyVisibility((prev) => ({
                                ...prev,
                                [p.id]: !prev[p.id],
                              }))
                            }
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-dim hover:text-foreground transition-colors"
                          >
                            {isVisible ? (
                              <EyeOff size={14} />
                            ) : (
                              <Eye size={14} />
                            )}
                          </button>
                        </div>
                        {isSet && (
                          <button
                            type="button"
                            onClick={() => handleClearKey(p.id, p.field)}
                            disabled={savingLlm}
                            className="h-10 px-3 rounded-lg text-xs font-medium transition-colors hover:bg-[#ffb4ab]/10 text-[#ffb4ab]"
                            title="Clear this API key"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isTouched && inputVal && (
                          <Button
                            type="button"
                            onClick={async () => {
                              setSavingLlm(true);
                              setLlmMsg(null);
                              try {
                                const payload: Record<string, string> = {
                                  [p.field]: inputVal,
                                };
                                const updated =
                                  await api.settings.updateLLM(payload);
                                setLlm(updated);
                                setKeyInputs((prev) => {
                                  const next = { ...prev };
                                  delete next[p.id];
                                  return next;
                                });
                                setLlmMsg({
                                  type: "success",
                                  text: `${p.name} key saved`,
                                });
                              } catch (err: unknown) {
                                setLlmMsg({
                                  type: "error",
                                  text:
                                    err instanceof Error
                                      ? err.message
                                      : "Failed to save key",
                                });
                              } finally {
                                setSavingLlm(false);
                              }
                            }}
                            disabled={savingLlm}
                            className="h-10 px-4 gradient-primary text-[#060e20] font-medium border-0 hover:opacity-90 text-xs"
                          >
                            {savingLlm ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Save className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════ General Tab ═══════════════════════ */}
      {activeTab === "general" && (
        <div className="max-w-3xl w-full mb-10 space-y-6">
          <div
            className="rounded-2xl p-6"
            style={{ background: "var(--surface-container)" }}
          >
            <h3 className="text-sm font-heading font-semibold text-foreground mb-5 flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent-cyan" />
              Application Settings
            </h3>

            {generalMsg && (
              <div
                className={`mb-5 p-3 rounded-lg text-sm flex items-center gap-2 ${
                  generalMsg.type === "success"
                    ? "text-[#4edea3]"
                    : "text-[#ffb4ab]"
                }`}
                style={{
                  background:
                    generalMsg.type === "success"
                      ? "rgba(78, 222, 163, 0.1)"
                      : "rgba(255, 180, 171, 0.1)",
                }}
              >
                {generalMsg.type === "success" ? (
                  <CheckCircle className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                {generalMsg.text}
              </div>
            )}

            <form onSubmit={handleSaveGeneral} className="space-y-4">
              <div className="space-y-2">
                <Label
                  htmlFor="appName"
                  className="text-[11px] uppercase tracking-[0.05rem]"
                  style={{ color: "var(--on-surface-dim)" }}
                >
                  Application Name
                </Label>
                <Input
                  id="appName"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="MAS - Multi-Agent System"
                  className="bg-surface-lowest border-0 text-foreground h-11 max-w-md"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="maxDepth"
                    className="text-[11px] uppercase tracking-[0.05rem]"
                    style={{ color: "var(--on-surface-dim)" }}
                  >
                    Max Delegation Depth
                  </Label>
                  <Input
                    id="maxDepth"
                    type="number"
                    min={1}
                    max={50}
                    value={maxDepth}
                    onChange={(e) => setMaxDepth(Number(e.target.value))}
                    className="bg-surface-lowest border-0 text-foreground h-11"
                  />
                  <p
                    className="text-[11px]"
                    style={{ color: "var(--on-surface-dim)" }}
                  >
                    How many levels deep agents can delegate tasks
                  </p>
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="maxSteps"
                    className="text-[11px] uppercase tracking-[0.05rem]"
                    style={{ color: "var(--on-surface-dim)" }}
                  >
                    Max Steps per Execution
                  </Label>
                  <Input
                    id="maxSteps"
                    type="number"
                    min={1}
                    max={100}
                    value={maxSteps}
                    onChange={(e) => setMaxSteps(Number(e.target.value))}
                    className="bg-surface-lowest border-0 text-foreground h-11"
                  />
                  <p
                    className="text-[11px]"
                    style={{ color: "var(--on-surface-dim)" }}
                  >
                    Maximum LLM reasoning steps per task execution
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={savingGeneral}
                  className="gradient-primary text-[#060e20] font-medium border-0 hover:opacity-90 px-6"
                >
                  {savingGeneral ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save Settings
                </Button>
              </div>
            </form>
          </div>

          {/* Environment Info */}
          <div
            className="rounded-2xl p-6"
            style={{ background: "var(--surface-container)" }}
          >
            <h3 className="text-sm font-heading font-semibold text-foreground mb-4 flex items-center gap-2">
              <Globe className="w-4 h-4 text-accent-cyan" />
              Current Configuration
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <InfoTile
                label="App Name"
                value={general?.app_name || "MAS"}
              />
              <InfoTile
                label="Delegation Depth"
                value={String(general?.max_delegation_depth ?? 5)}
              />
              <InfoTile
                label="Max Steps"
                value={String(general?.max_steps_default ?? 10)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function InfoTile({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--surface-lowest)" }}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
        style={{ color: "var(--on-surface-dim)" }}
      >
        {label}
      </p>
      <p
        className={`text-sm font-medium truncate ${mono ? "font-mono text-[11px]" : ""}`}
        style={{ color: "var(--foreground)" }}
      >
        {value}
      </p>
    </div>
  );
}
