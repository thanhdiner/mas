"""
Tests for the Orchestrator — core agent runtime engine.

Tests:
  1. Delegation depth limiting (prevent infinite loops)
  2. Task status transitions (queued → running → done/failed)
  3. Tool execution flow
  4. Error handling and recovery
  5. Multi-model provider selection
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.models.task import TaskStatus
from app.models.execution import ExecutionStatus


# ─── Fixtures ────────────────────────────────────────────────────────────

@pytest.fixture
def mock_settings():
    """Create mock settings."""
    settings = MagicMock()
    settings.MAX_DELEGATION_DEPTH = 5
    settings.LLM_MODEL = "gpt-5.4-mini"
    settings.OPENAI_MODEL = "gpt-5.4-mini"
    settings.OPENAI_API_KEY = "test-key"
    settings.LLM_PROVIDER = "openai"
    settings.CHROMADB_PATH = "./test_chroma"
    settings.USE_CELERY = False
    return settings


@pytest.fixture
def mock_agent():
    """Create a mock agent."""
    agent = MagicMock()
    agent.id = "agent-123"
    agent.name = "Test Agent"
    agent.role = "Tester"
    agent.description = "A test agent"
    agent.systemPrompt = "You are a test agent."
    agent.allowedTools = []
    agent.toolConfig = {}
    agent.allowedSubAgents = []
    agent.maxSteps = 10
    agent.active = True
    agent.model = None
    agent.provider = None
    return agent


@pytest.fixture
def mock_task():
    """Create a mock task."""
    task = MagicMock()
    task.id = "task-456"
    task.title = "Test Task"
    task.input = "Do something useful"
    task.assignedAgentId = "agent-123"
    task.status = TaskStatus.QUEUED
    task.allowDelegation = True
    task.requiresApproval = False
    task.parentTaskId = None
    return task


@pytest.fixture
def mock_execution():
    """Create a mock execution."""
    execution = MagicMock()
    execution.id = "exec-789"
    execution.taskId = "task-456"
    execution.agentId = "agent-123"
    execution.status = ExecutionStatus.RUNNING
    return execution


# ─── Delegation Depth Tests ──────────────────────────────────────────────

class TestDelegationDepth:
    """Test that delegation depth limits prevent infinite loops."""

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.get_settings")
    @patch("app.services.orchestrator.TaskService")
    async def test_exceeds_max_depth_fails_task(
        self, mock_task_service, mock_get_settings, mock_settings
    ):
        """Task should fail when delegation depth exceeds MAX_DELEGATION_DEPTH."""
        mock_get_settings.return_value = mock_settings
        mock_task_service.update_task_status = AsyncMock()

        from app.services.orchestrator import Orchestrator

        await Orchestrator.execute_task("task-deep", depth=6)

        mock_task_service.update_task_status.assert_called_once_with(
            "task-deep",
            TaskStatus.FAILED,
            error="Maximum delegation depth (5) exceeded. Possible infinite loop.",
        )

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.get_settings")
    @patch("app.services.orchestrator.TaskService")
    async def test_at_max_depth_still_works(
        self, mock_task_service, mock_get_settings, mock_settings
    ):
        """Task at exactly max depth should still be allowed to execute."""
        mock_get_settings.return_value = mock_settings
        mock_task_service.get_task = AsyncMock(return_value=None)

        from app.services.orchestrator import Orchestrator

        await Orchestrator.execute_task("task-at-limit", depth=5)

        # Should not fail due to depth - it gets the task first
        mock_task_service.get_task.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.get_settings")
    @patch("app.services.orchestrator.TaskService")
    async def test_zero_depth_works(
        self, mock_task_service, mock_get_settings, mock_settings
    ):
        """Task at depth 0 should work normally."""
        mock_get_settings.return_value = mock_settings
        mock_task_service.get_task = AsyncMock(return_value=None)

        from app.services.orchestrator import Orchestrator

        await Orchestrator.execute_task("task-zero", depth=0)

        mock_task_service.get_task.assert_called_once()


# ─── Task Status Transition Tests ────────────────────────────────────────

class TestTaskStatusTransitions:
    """Test that task status transitions happen correctly."""

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.ws_manager")
    @patch("app.services.orchestrator.ExecutionService")
    @patch("app.services.orchestrator.AgentService")
    @patch("app.services.orchestrator.TaskService")
    @patch("app.services.orchestrator.get_settings")
    async def test_task_not_found_returns_early(
        self, mock_get_settings, mock_task_service,
        mock_agent_service, mock_exec_service, mock_ws,
        mock_settings,
    ):
        """When task is not found, execution should return early."""
        mock_get_settings.return_value = mock_settings
        mock_task_service.get_task = AsyncMock(return_value=None)

        from app.services.orchestrator import Orchestrator
        await Orchestrator.execute_task("nonexistent-task")

        mock_task_service.update_task_status.assert_not_called()

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.ws_manager")
    @patch("app.services.orchestrator.ExecutionService")
    @patch("app.services.orchestrator.AgentService")
    @patch("app.services.orchestrator.TaskService")
    @patch("app.services.orchestrator.get_settings")
    async def test_inactive_agent_fails_task(
        self, mock_get_settings, mock_task_service,
        mock_agent_service, mock_exec_service, mock_ws,
        mock_settings, mock_task, mock_agent,
    ):
        """Task assigned to inactive agent should fail."""
        mock_get_settings.return_value = mock_settings
        mock_task_service.update_task_status = AsyncMock()
        mock_task_service.get_task = AsyncMock(return_value=mock_task)
        mock_agent.active = False
        mock_agent_service.get_agent = AsyncMock(return_value=mock_agent)

        from app.services.orchestrator import Orchestrator
        await Orchestrator.execute_task("task-456")

        mock_task_service.update_task_status.assert_called_with(
            "task-456", TaskStatus.FAILED, error="Assigned agent is inactive"
        )

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.ws_manager")
    @patch("app.services.orchestrator.ExecutionService")
    @patch("app.services.orchestrator.AgentService")
    @patch("app.services.orchestrator.TaskService")
    @patch("app.services.orchestrator.get_settings")
    async def test_missing_agent_fails_task(
        self, mock_get_settings, mock_task_service,
        mock_agent_service, mock_exec_service, mock_ws,
        mock_settings, mock_task,
    ):
        """Task with non-existent agent should fail."""
        mock_get_settings.return_value = mock_settings
        mock_task_service.update_task_status = AsyncMock()
        mock_task_service.get_task = AsyncMock(return_value=mock_task)
        mock_agent_service.get_agent = AsyncMock(return_value=None)

        from app.services.orchestrator import Orchestrator
        await Orchestrator.execute_task("task-456")

        mock_task_service.update_task_status.assert_called_with(
            "task-456", TaskStatus.FAILED, error="Assigned agent not found"
        )


# ─── Agent Model Selection Tests ─────────────────────────────────────────

class TestAgentModelSelection:
    """Test that per-agent model selection works correctly."""

    @pytest.mark.asyncio
    async def test_agent_with_model_override(self, mock_agent, mock_settings):
        """Agent with custom model should use that model."""
        mock_agent.model = "claude-sonnet-4-20250514"
        mock_agent.provider = "anthropic"

        from app.services.orchestrator import Orchestrator
        model, provider = await Orchestrator._get_agent_model(mock_agent)

        assert model == "claude-sonnet-4-20250514"
        assert provider == "anthropic"

    @pytest.mark.asyncio
    @patch("app.services.system_settings_service.SystemSettingsService.get_llm_settings")
    async def test_agent_without_model_uses_default(self, mock_get_llm, mock_agent, mock_settings):
        """Agent without model should use global settings."""
        mock_agent.model = None
        mock_agent.provider = None

        mock_get_llm.return_value = AsyncMock()
        mock_get_llm.return_value.defaultModel = "gpt-5.4-mini"
        mock_get_llm.return_value.defaultProvider = "openai"

        from app.services.orchestrator import Orchestrator
        model, provider = await Orchestrator._get_agent_model(mock_agent)

        assert model == "gpt-5.4-mini"
        assert provider == "openai"


# ─── Delegation Handler Tests ────────────────────────────────────────────

class TestDelegationHandler:
    """Test the delegation handler logic."""

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.ws_manager")
    @patch("app.services.orchestrator.ExecutionService")
    @patch("app.services.orchestrator.AgentService")
    @patch("app.services.orchestrator.TaskService")
    async def test_delegation_to_unauthorized_agent(
        self, mock_task_service, mock_agent_service,
        mock_exec_service, mock_ws,
        mock_task, mock_agent, mock_execution,
    ):
        """Delegating to an agent not in allowedSubAgents should error."""
        mock_agent.allowedSubAgents = ["agent-allowed"]
        mock_exec_service.add_step = AsyncMock()

        from app.services.orchestrator import Orchestrator

        result = await Orchestrator._handle_delegation(
            mock_task, mock_agent, mock_execution,
            {"agent_id": "agent-UNAUTHORIZED", "subtask_title": "Test", "subtask_input": "Test"},
            depth=0,
        )

        assert "ERROR" in result
        assert "not in allowed sub-agents" in result

    @pytest.mark.asyncio
    @patch("app.services.orchestrator.ws_manager")
    @patch("app.services.orchestrator.ExecutionService")
    @patch("app.services.orchestrator.AgentService")
    @patch("app.services.orchestrator.TaskService")
    async def test_delegation_to_inactive_agent(
        self, mock_task_service, mock_agent_service,
        mock_exec_service, mock_ws,
        mock_task, mock_agent, mock_execution,
    ):
        """Delegating to an inactive agent should error."""
        mock_agent.allowedSubAgents = ["agent-inactive"]
        mock_exec_service.add_step = AsyncMock()

        inactive_agent = MagicMock()
        inactive_agent.active = False
        mock_agent_service.get_agent = AsyncMock(return_value=inactive_agent)

        from app.services.orchestrator import Orchestrator

        result = await Orchestrator._handle_delegation(
            mock_task, mock_agent, mock_execution,
            {"agent_id": "agent-inactive", "subtask_title": "Test", "subtask_input": "Test"},
            depth=0,
        )

        assert "ERROR" in result
        assert "not found or inactive" in result


# ─── LLM Provider Tests ─────────────────────────────────────────────────

class TestLLMProviderResolution:
    """Test that model names are resolved to the correct provider."""

    def test_openai_models(self):
        from app.services.llm_provider import _resolve_provider, LLMProviderType
        assert _resolve_provider("gpt-5.4-mini") == LLMProviderType.OPENAI
        assert _resolve_provider("gpt-5.4") == LLMProviderType.OPENAI
        assert _resolve_provider("o4-preview") == LLMProviderType.OPENAI

    def test_anthropic_models(self):
        from app.services.llm_provider import _resolve_provider, LLMProviderType
        assert _resolve_provider("claude-4.6-sonnet-20260215") == LLMProviderType.ANTHROPIC
        assert _resolve_provider("claude-4.5-haiku-20251101") == LLMProviderType.ANTHROPIC

    def test_groq_models(self):
        from app.services.llm_provider import _resolve_provider, LLMProviderType
        assert _resolve_provider("grok-4.20") == LLMProviderType.GROQ
        assert _resolve_provider("llama-4-scout") == LLMProviderType.GROQ

    def test_unknown_defaults_to_openai(self):
        from app.services.llm_provider import _resolve_provider, LLMProviderType
        assert _resolve_provider("unknown-model") == LLMProviderType.OPENAI
