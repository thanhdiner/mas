"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  MessageSquare,
  Send,
  Bot,
  User,
  Wrench,
  Sparkles,
  RotateCcw,
  Zap,
} from "lucide-react";
import { api, Agent, PlaygroundResponse } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { name: string; arguments: string }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export default function PlaygroundPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [totalTokens, setTotalTokens] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.agents.list().then((a) => {
      setAgents(a);
      if (a.length > 0) setSelectedAgentId(a[0].id);
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !selectedAgentId || sending) return;

    const userMsg: ChatMsg = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setSending(true);

    try {
      const apiMessages = newMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const res: PlaygroundResponse = await api.playground.chat(
        selectedAgentId,
        apiMessages
      );

      const assistantMsg: ChatMsg = {
        role: "assistant",
        content: res.content,
        toolCalls: res.toolCalls,
        usage: res.usage,
      };
      setMessages([...newMessages, assistantMsg]);
      setTotalTokens((prev) => prev + (res.usage?.total_tokens || 0));
    } catch (err: unknown) {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: `⚠️ Error: ${err instanceof Error ? err.message : "Failed to get response"}`,
        },
      ]);
    }
    setSending(false);
  }, [input, selectedAgentId, sending, messages]);

  const handleClear = () => {
    setMessages([]);
    setTotalTokens(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)]">
      {/* Header */}
      <div className="shrink-0 mb-4">
        <PageHeader
          title="Agent Playground"
          description="Test-drive your agents with an interactive chat interface"
        />
      </div>

      {/* Agent Selector Bar */}
      <div
        className="shrink-0 flex items-center gap-4 p-4 rounded-xl mb-4"
        style={{
          background: "var(--surface-container)",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <Bot className="w-5 h-5 text-accent-cyan shrink-0" />
        <Select
          value={selectedAgentId}
          onValueChange={(val) => {
            setSelectedAgentId(val || "");
            handleClear();
          }}
        >
          <SelectTrigger className="bg-surface-high border-0 text-foreground max-w-md">
            <SelectValue placeholder="Select an agent..." />
          </SelectTrigger>
          <SelectContent
            style={{
              background: "var(--surface-high)",
              borderColor: "rgba(255,255,255,0.1)",
            }}
          >
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id} className="text-foreground">
                <span className="flex items-center gap-2">
                  <Bot className="w-3 h-3 text-accent-cyan" /> {a.name}
                  <span className="text-[10px] text-on-surface-dim ml-1">
                    — {a.role}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedAgent && (
          <div className="flex items-center gap-4 ml-auto text-xs">
            <div className="flex items-center gap-1.5">
              <Wrench className="w-3 h-3" style={{ color: "var(--on-surface-dim)" }} />
              <span style={{ color: "var(--on-surface-dim)" }}>
                {selectedAgent.allowedTools.length} tools
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="w-3 h-3" style={{ color: "var(--on-surface-dim)" }} />
              <span style={{ color: "var(--on-surface-dim)" }}>
                {totalTokens} tokens used
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="text-on-surface-dim hover:text-foreground"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
            </Button>
          </div>
        )}
      </div>

      {/* Chat Area */}
      <div
        className="flex-1 overflow-y-auto rounded-xl p-6 mb-4"
        style={{
          background: "var(--surface-base)",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{
                background: "rgba(123, 208, 255, 0.08)",
                border: "1px solid rgba(123, 208, 255, 0.15)",
              }}
            >
              <Sparkles className="w-8 h-8 text-accent-cyan" />
            </div>
            <h3 className="font-heading text-lg font-semibold mb-2">
              Start a conversation
            </h3>
            <p
              className="text-sm max-w-md"
              style={{ color: "var(--on-surface-dim)" }}
            >
              Select an agent above and send a message to test its personality,
              tools, and system prompt in real-time.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 animate-slide-in ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                {msg.role === "assistant" && (
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1"
                    style={{
                      background: "rgba(123, 208, 255, 0.1)",
                      border: "1px solid rgba(123, 208, 255, 0.2)",
                    }}
                  >
                    <Bot className="w-4 h-4 text-accent-cyan" />
                  </div>
                )}

                <div
                  className={`max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user" ? "rounded-br-sm" : "rounded-bl-sm"
                  }`}
                  style={{
                    background:
                      msg.role === "user"
                        ? "linear-gradient(135deg, rgba(123, 208, 255, 0.15), rgba(0, 138, 187, 0.1))"
                        : "var(--surface-container)",
                    border: `1px solid ${
                      msg.role === "user"
                        ? "rgba(123, 208, 255, 0.2)"
                        : "rgba(255,255,255,0.05)"
                    }`,
                  }}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>

                  {/* Tool calls */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {msg.toolCalls.map((tc, j) => (
                        <div
                          key={j}
                          className="rounded-lg p-2.5 text-[11px]"
                          style={{
                            background: "rgba(123, 208, 255, 0.05)",
                            border: "1px solid rgba(123, 208, 255, 0.1)",
                          }}
                        >
                          <div className="flex items-center gap-1.5 mb-1 text-accent-cyan font-semibold">
                            <Wrench className="w-3 h-3" /> {tc.name}
                          </div>
                          <pre
                            className="text-[10px] overflow-x-auto font-mono"
                            style={{ color: "var(--on-surface-dim)" }}
                          >
                            {(() => {
                              try {
                                return JSON.stringify(
                                  JSON.parse(tc.arguments),
                                  null,
                                  2
                                );
                              } catch {
                                return tc.arguments;
                              }
                            })()}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Token usage */}
                  {msg.usage && (
                    <div
                      className="mt-2 text-[10px] flex items-center gap-2"
                      style={{ color: "var(--on-surface-dim)" }}
                    >
                      <Zap className="w-2.5 h-2.5" />
                      {msg.usage.total_tokens} tokens ({msg.usage.prompt_tokens}{" "}
                      prompt + {msg.usage.completion_tokens} completion)
                    </div>
                  )}
                </div>

                {msg.role === "user" && (
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1"
                    style={{
                      background: "var(--surface-high)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <User className="w-4 h-4 text-foreground" />
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="flex gap-3 animate-slide-in">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    background: "rgba(123, 208, 255, 0.1)",
                    border: "1px solid rgba(123, 208, 255, 0.2)",
                  }}
                >
                  <Bot className="w-4 h-4 text-accent-cyan animate-pulse" />
                </div>
                <div
                  className="rounded-xl rounded-bl-sm px-4 py-3"
                  style={{
                    background: "var(--surface-container)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div className="flex gap-1.5">
                    <div
                      className="w-2 h-2 rounded-full animate-bounce bg-accent-cyan"
                      style={{ animationDelay: "0ms" }}
                    />
                    <div
                      className="w-2 h-2 rounded-full animate-bounce bg-accent-cyan"
                      style={{ animationDelay: "150ms" }}
                    />
                    <div
                      className="w-2 h-2 rounded-full animate-bounce bg-accent-cyan"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div
        className="shrink-0 rounded-xl p-4"
        style={{
          background: "var(--surface-container)",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div className="flex gap-3">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedAgent
                ? `Message ${selectedAgent.name}...`
                : "Select an agent to start chatting..."
            }
            disabled={!selectedAgentId || sending}
            rows={2}
            className="bg-surface-high border-0 text-foreground resize-none flex-1 placeholder:text-on-surface-dim"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || !selectedAgentId || sending}
            className="gradient-primary text-[#060e20] font-semibold self-end h-10 w-10 p-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[10px] mt-2" style={{ color: "var(--on-surface-dim)" }}>
          Press Enter to send, Shift+Enter for new line. Messages are not
          persisted.
        </p>
      </div>
    </div>
  );
}
