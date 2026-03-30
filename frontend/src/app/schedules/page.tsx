"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Fuse from "fuse.js";
import {
  Clock,
  Plus,
  Trash2,
  Bot,
  Calendar,
  Timer,
  Zap,
  Play,
  Pause,
  Search,
  Edit2,
  X,
} from "lucide-react";
import { api, Schedule, ScheduleCreate, Agent } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const SCHEDULE_TYPE_OPTIONS = [
  { value: "cron", label: "Cron Schedule", icon: Calendar, desc: "Run on a cron expression (e.g. every day at 8 AM)" },
  { value: "interval", label: "Interval", icon: Timer, desc: "Run every N seconds/minutes/hours" },
  { value: "once", label: "Run Once", icon: Zap, desc: "Run once at a specific date & time" },
];

const CRON_PRESETS = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every 5 minutes", value: "*/5 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every day at 8 AM", value: "0 8 * * *" },
  { label: "Every day at midnight", value: "0 0 * * *" },
  { label: "Weekdays at 9 AM", value: "0 9 * * 1-5" },
  { label: "Every Monday at 8 AM", value: "0 8 * * 1" },
  { label: "1st of every month", value: "0 0 1 * *" },
];

function formatNextRun(dateStr?: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  
  if (diffMs < 0) return "Running soon...";
  
  const totalSeconds = Math.floor(diffMs / 1000);
  if (totalSeconds < 60) return `in ${totalSeconds}s`;
  
  const secs = totalSeconds % 60;
  const mins = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  
  if (hours > 24) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  
  if (hours > 0) {
    return `in ${hours}h ${mins}m`;
  }
  
  return `in ${mins}m ${secs}s`;
}

function formatLastRun(dateStr?: string | null) {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function SchedulesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading: loading } = useQuery({
    queryKey: ["schedules"],
    queryFn: () => Promise.all([api.schedules.list(), api.agents.list()]),
    refetchInterval: 5000,
  });
  const schedules = data?.[0] ?? [];
  const agents = data?.[1] ?? [];
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editSchedule, setEditSchedule] = useState<Schedule | null>(null);

  // Trigger re-render every second to update countdowns
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Form state
  const [formName, setFormName] = useState("");
  const [formAgentId, setFormAgentId] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [formType, setFormType] = useState<"cron" | "interval" | "once">("cron");
  const [formCron, setFormCron] = useState("0 8 * * *");
  const [formInterval, setFormInterval] = useState(3600);
  const [formRunAt, setFormRunAt] = useState("");
  const [formTimezone, setFormTimezone] = useState("Asia/Ho_Chi_Minh");
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setFormName(""); setFormAgentId(""); setFormPrompt(""); setFormType("cron");
    setFormCron("0 8 * * *"); setFormInterval(3600); setFormRunAt(""); setFormTimezone("Asia/Ho_Chi_Minh");
    setFormActive(true); setEditSchedule(null);
  };

  const openCreate = () => {
    resetForm();
    setShowCreate(true);
  };

  const openEdit = (s: Schedule) => {
    setEditSchedule(s);
    setFormName(s.name);
    setFormAgentId(s.agentId);
    setFormPrompt(s.promptPayload);
    setFormType(s.scheduleType);
    setFormCron(s.cronExpression || "0 8 * * *");
    setFormInterval(s.intervalSeconds || 3600);
    setFormRunAt(s.runAt || "");
    setFormTimezone(s.timezone);
    setFormActive(s.isActive);
    setShowCreate(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const data: ScheduleCreate = {
      name: formName,
      agentId: formAgentId,
      promptPayload: formPrompt,
      scheduleType: formType,
      cronExpression: formType === "cron" ? formCron : undefined,
      intervalSeconds: formType === "interval" ? formInterval : undefined,
      runAt: formType === "once" ? formRunAt : undefined,
      timezone: formTimezone,
      isActive: formActive,
    };
    try {
      if (editSchedule) {
        await api.schedules.update(editSchedule.id, data);
      } else {
        await api.schedules.create(data);
      }
      setShowCreate(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.schedules.delete(id);
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    try {
      await api.schedules.toggle(id, active);
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    } catch (err) {
      console.error(err);
    }
  };

  const filtered = useMemo(() => {
    const query = debouncedSearch.trim();
    if (!query) return schedules;

    const fuse = new Fuse(schedules, {
      keys: ["name", "agentName", "promptPayload", "scheduleType"],
      threshold: 0.4,
      ignoreLocation: true,
      includeMatches: false,
    });

    return fuse.search(query).map((result) => result.item);
  }, [schedules, debouncedSearch]);

  return (
    <>
      <PageHeader
        title="Schedules"
        description="Automate agent execution on cron schedules, intervals, or one-time triggers."
      />

      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="relative max-w-md flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: "var(--on-surface-dim)" }}
          />
          <Input
            placeholder="Search schedules..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-10 bg-surface-container border-0 text-foreground placeholder:text-on-surface-dim"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 transition-colors hover:bg-white/10 hover:text-foreground"
              style={{ color: "var(--on-surface-dim)" }}
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Button
          onClick={openCreate}
          className="gradient-primary text-[#060e20] font-semibold shadow-lg hover:shadow-accent-cyan/30 transition-all"
        >
          <Plus className="w-4 h-4 mr-2" /> New Schedule
        </Button>
      </div>

      <div className="mb-4 flex items-center justify-between px-1">
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-70" style={{ color: "var(--on-surface-dim)" }}>
          {search ? (
            <>
              Found <span className="font-extrabold text-accent-cyan">{filtered.length}</span> match{filtered.length === 1 ? "" : "es"} for &quot;{search}&quot;
            </>
          ) : (
            <>
              Total <span className="font-extrabold text-accent-cyan">{schedules.length}</span> schedules
            </>
          )}
        </p>
      </div>

      {loading ? (
        <div className="text-center py-20 text-sm" style={{ color: "var(--on-surface-dim)" }}>
          Loading schedules...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 rounded-xl" style={{ background: "var(--surface-container)" }}>
          <Clock className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--on-surface-dim)", opacity: 0.4 }} />
          <p className="text-lg font-heading font-medium mb-2">No schedules yet</p>
          <p className="text-sm mb-6" style={{ color: "var(--on-surface-dim)" }}>
            Create a schedule to automate agent execution
          </p>
          {search ? (
            <Button
              variant="secondary"
              onClick={() => setSearch("")}
              className="border-0 bg-surface-base text-foreground mt-2"
            >
              Clear Search
            </Button>
          ) : (
            <Button
              onClick={openCreate}
              className="gradient-primary text-[#060e20] font-semibold"
            >
              <Plus className="w-4 h-4 mr-2" /> Create First Schedule
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s, i) => {
            const TypeIcon = SCHEDULE_TYPE_OPTIONS.find(o => o.value === s.scheduleType)?.icon || Calendar;
            return (
              <div
                key={s.id}
                className="group rounded-xl p-5 transition-all duration-200 animate-slide-in relative overflow-hidden"
                style={{
                  background: "var(--surface-base)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  animationDelay: `${i * 40}ms`,
                }}
              >
                {/* Decorative line on the left */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                  style={{ background: s.isActive ? "linear-gradient(180deg, #7bd0ff, #008abb)" : "rgba(255,255,255,0.06)" }}
                />

                <div className="flex items-center justify-between gap-4">
                  {/* Left: Info */}
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        background: s.isActive ? "rgba(123, 208, 255, 0.1)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${s.isActive ? "rgba(123, 208, 255, 0.2)" : "rgba(255,255,255,0.06)"}`,
                      }}
                    >
                      <TypeIcon className="w-5 h-5" style={{ color: s.isActive ? "#7bd0ff" : "rgba(232,234,237,0.3)" }} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <button
                        onClick={() => openEdit(s)}
                        className="font-heading text-sm font-semibold text-foreground hover:text-accent-cyan transition-colors truncate block text-left"
                      >
                        {s.name}
                      </button>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Bot className="w-3 h-3" style={{ color: "var(--on-surface-dim)" }} />
                        <span className="text-xs" style={{ color: "var(--on-surface-dim)" }}>
                          {s.agentName || "Unknown Agent"}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-high/50 text-accent-teal uppercase tracking-wider font-medium">
                          {s.scheduleType === "cron" ? s.cronExpression : s.scheduleType === "interval" ? `Every ${s.intervalSeconds}s` : "Once"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Center: Stats */}
                  <div className="hidden md:flex items-center gap-8 text-xs shrink-0">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: "var(--on-surface-dim)" }}>Next Run</p>
                      <p className="text-accent-cyan font-medium">{formatNextRun(s.nextRunAt)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: "var(--on-surface-dim)" }}>Last Run</p>
                      <p className="text-foreground">{formatLastRun(s.lastRunAt)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: "var(--on-surface-dim)" }}>Runs</p>
                      <p className="text-foreground font-medium">{s.totalRuns}</p>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={s.isActive}
                      onCheckedChange={(checked) => handleToggle(s.id, checked)}
                      className="mr-2"
                    />
                    <button
                      onClick={() => openEdit(s)}
                      className="p-2 rounded-lg hover:bg-white/5 transition-colors opacity-0 group-hover:opacity-100"
                      title="Edit Schedule"
                    >
                      <Edit2 className="w-4 h-4" style={{ color: "var(--on-surface-dim)" }} />
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="p-2 rounded-lg hover:bg-[#ffb4ab]/10 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete Schedule"
                    >
                      <Trash2 className="w-4 h-4 text-[#ffb4ab]" />
                    </button>
                  </div>
                </div>

                {/* Prompt preview */}
                <div className="mt-3 ml-14 text-xs line-clamp-1" style={{ color: "var(--on-surface-dim)" }}>
                  <span className="text-white/30 mr-1.5">Prompt:</span> {s.promptPayload}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) { setShowCreate(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-xl" style={{ background: "var(--surface-high)", borderColor: "rgba(255,255,255,0.1)", borderWidth: "1px" }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading">
              <Clock className="w-5 h-5 text-accent-cyan" />
              {editSchedule ? "Edit Schedule" : "New Schedule"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2 max-h-[60vh] overflow-y-auto px-2 -mx-2">
            {/* Name */}
            <div>
              <Label className="text-sm font-medium text-foreground mb-1.5 block">Schedule Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Daily Market Report"
                className="bg-surface-container border-0 text-foreground"
              />
            </div>

            {/* Agent */}
            <div>
              <Label className="text-sm font-medium text-foreground mb-1.5 block">Assign to Agent</Label>
              <Select value={formAgentId} onValueChange={(val) => setFormAgentId(val || "")}>
                <SelectTrigger className="bg-surface-container border-0 text-foreground">
                  <SelectValue placeholder="Select an agent..." />
                </SelectTrigger>
                <SelectContent style={{ background: "var(--surface-high)", borderColor: "rgba(255,255,255,0.1)" }}>
                  {agents.map(a => (
                    <SelectItem key={a.id} value={a.id} className="text-foreground">
                      <span className="flex items-center gap-2">
                        <Bot className="w-3 h-3 text-accent-cyan" /> {a.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Prompt */}
            <div>
              <Label className="text-sm font-medium text-foreground mb-1.5 block">Prompt / Instruction</Label>
              <Textarea
                value={formPrompt}
                onChange={(e) => setFormPrompt(e.target.value)}
                placeholder="What should the agent do when triggered?"
                rows={3}
                className="bg-surface-container border-0 text-foreground resize-none"
              />
            </div>

            {/* Schedule Type */}
            <div>
              <Label className="text-sm font-medium text-foreground mb-2 block">Trigger Type</Label>
              <div className="grid grid-cols-3 gap-2">
                {SCHEDULE_TYPE_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const selected = formType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setFormType(opt.value as "cron" | "interval" | "once")}
                      className="p-3 rounded-lg text-center transition-all duration-200 border"
                      style={{
                        background: selected ? "rgba(123,208,255,0.1)" : "var(--surface-container)",
                        borderColor: selected ? "rgba(123,208,255,0.3)" : "transparent",
                      }}
                    >
                      <Icon className="w-5 h-5 mx-auto mb-1" style={{ color: selected ? "#7bd0ff" : "var(--on-surface-dim)" }} />
                      <span className="text-[11px] font-semibold" style={{ color: selected ? "#7bd0ff" : "var(--on-surface-dim)" }}>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cron Config */}
            {formType === "cron" && (
              <div>
                <Label className="text-sm font-medium text-foreground mb-1.5 block">Cron Expression</Label>
                <Input
                  value={formCron}
                  onChange={e => setFormCron(e.target.value)}
                  placeholder="0 8 * * *"
                  className="bg-surface-container border-0 text-foreground font-mono mb-2"
                />
                <div className="flex flex-wrap gap-1.5">
                  {CRON_PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setFormCron(p.value)}
                      className="text-[10px] px-2 py-1 rounded-md transition-colors font-medium"
                      style={{
                        background: formCron === p.value ? "rgba(123,208,255,0.15)" : "var(--surface-container)",
                        color: formCron === p.value ? "#7bd0ff" : "var(--on-surface-dim)",
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Interval Config */}
            {formType === "interval" && (
              <div>
                <Label className="text-sm font-medium text-foreground mb-1.5 block">Interval (seconds)</Label>
                <Input
                  type="number"
                  value={formInterval}
                  onChange={e => setFormInterval(Number(e.target.value))}
                  min={60}
                  className="bg-surface-container border-0 text-foreground"
                />
                <p className="text-[11px] mt-1" style={{ color: "var(--on-surface-dim)" }}>
                  Minimum 60 seconds. {formInterval >= 3600 ? `≈ ${(formInterval / 3600).toFixed(1)} hours` : formInterval >= 60 ? `≈ ${(formInterval / 60).toFixed(0)} minutes` : ""}
                </p>
              </div>
            )}

            {/* Once Config */}
            {formType === "once" && (
              <div>
                <Label className="text-sm font-medium text-foreground mb-1.5 block">Run At (datetime)</Label>
                <Input
                  type="datetime-local"
                  value={formRunAt}
                  onChange={e => setFormRunAt(e.target.value)}
                  className="bg-surface-container border-0 text-foreground"
                />
              </div>
            )}

            {/* Timezone */}
            <div>
              <Label className="text-sm font-medium text-foreground mb-1.5 block">Timezone</Label>
              <Select value={formTimezone} onValueChange={(val) => setFormTimezone(val || "")}>
                <SelectTrigger className="bg-surface-container border-0 text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: "var(--surface-high)", borderColor: "rgba(255,255,255,0.1)" }}>
                  {["Asia/Ho_Chi_Minh", "UTC", "US/Eastern", "US/Pacific", "Europe/London", "Asia/Tokyo", "Asia/Singapore"].map(tz => (
                    <SelectItem key={tz} value={tz} className="text-foreground">{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-foreground">Enable immediately</Label>
              <Switch checked={formActive} onCheckedChange={setFormActive} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t border-white/[0.05]">
            <Button
              variant="ghost"
              onClick={() => { setShowCreate(false); resetForm(); }}
              className="text-on-surface-dim hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formName || !formAgentId || !formPrompt}
              className="gradient-primary text-[#060e20] font-semibold"
            >
              {saving ? "Saving..." : editSchedule ? "Update Schedule" : "Create Schedule"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
