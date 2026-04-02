"""
Tool Registry — central hub for all agent tools.

Each tool is:
  - An OpenAI function-calling schema (for the LLM)
  - A Python async handler that actually executes the action

Agents declare which tools they may use via `allowedTools: list[str]`.
The orchestrator filters the registry at runtime to only expose allowed tools.
"""

from __future__ import annotations
import importlib
from typing import Any, Callable, Awaitable

# Type alias for tool handlers
ToolHandler = Callable[..., Awaitable[str]]


class _ToolEntry:
    """Internal record for a registered tool."""

    def __init__(self, name: str, description: str, schema: dict, handler: ToolHandler, config_schema: list[dict]):
        self.name = name
        self.description = description
        self.schema = schema  # OpenAI function-calling 'parameters' dict
        self.handler = handler
        self.config_schema = config_schema

    def to_openai_tool(self) -> dict:
        """Return the tool in OpenAI function-calling format."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.schema,
            },
        }


class ToolRegistry:
    """Singleton registry that holds all available tools."""

    def __init__(self):
        self._tools: dict[str, _ToolEntry] = {}

    def register(self, name: str, description: str, parameters: dict, handler: ToolHandler, config_schema: list[dict] = None):
        """Register a new tool."""
        self._tools[name] = _ToolEntry(name, description, parameters, handler, config_schema or [])

    def get_handler(self, name: str) -> ToolHandler | None:
        entry = self._tools.get(name)
        return entry.handler if entry else None

    def get_openai_tools(self, allowed: list[str]) -> list[dict]:
        """Return OpenAI tool schemas for the given allowed tool names."""
        return [
            self._tools[name].to_openai_tool()
            for name in allowed
            if name in self._tools
        ]

    def list_all(self) -> list[dict[str, Any]]:
        """Return metadata for every registered tool (for frontend catalog)."""
        return [
            {"name": e.name, "description": e.description, "configSchema": e.config_schema}
            for e in self._tools.values()
        ]


# ── Singleton ──────────────────────────────────────────────
tool_registry = ToolRegistry()


# ── Auto-register built-in tools on import ─────────────────
def _bootstrap():
    """Import each tool module so its register() call fires."""
    modules = [
        "app.tools.web_search",
        "app.tools.read_website",
        "app.tools.http_request",
        "app.tools.slack",
        "app.tools.notion",
        "app.tools.github",
        "app.tools.gmail",
        "app.tools.execute_code",
        "app.tools.write_file",
        "app.tools.knowledge_search",
        "app.tools.facebook",
    ]
    for mod in modules:
        try:
            importlib.import_module(mod)
        except Exception as exc:
            print(f"[ToolRegistry] WARNING: could not load {mod}: {exc}")


_bootstrap()


# Convenience export: list of tool names for front-end catalog
AVAILABLE_TOOLS = tool_registry.list_all
