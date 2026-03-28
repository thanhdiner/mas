"""
Tests for task lifecycle status transitions.

Validates the full lifecycle: queued → running → done/failed/cancelled
and special states like waiting_approval.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.models.task import TaskStatus


class TestTaskLifecycle:
    """Test full task lifecycle transitions."""

    @pytest.mark.asyncio
    async def test_valid_status_transitions(self):
        """Verify all valid status transitions are defined."""
        valid_transitions = {
            TaskStatus.QUEUED: [TaskStatus.RUNNING, TaskStatus.CANCELLED],
            TaskStatus.RUNNING: [TaskStatus.DONE, TaskStatus.FAILED, TaskStatus.WAITING_APPROVAL, TaskStatus.CANCELLED],
            TaskStatus.WAITING_APPROVAL: [TaskStatus.DONE, TaskStatus.FAILED, TaskStatus.CANCELLED],
            TaskStatus.FAILED: [TaskStatus.QUEUED, TaskStatus.RUNNING],  # Re-execution
        }

        # TaskStatus.DONE and TaskStatus.CANCELLED are terminal states
        terminal_states = [TaskStatus.DONE, TaskStatus.CANCELLED]
        for state in terminal_states:
            assert state not in valid_transitions or valid_transitions[state] == []

    @pytest.mark.asyncio
    async def test_all_statuses_exist(self):
        """All required task statuses should exist."""
        expected = ["queued", "running", "waiting_approval", "done", "failed", "cancelled"]
        actual = [s.value for s in TaskStatus]
        assert set(expected) == set(actual)

    @pytest.mark.asyncio
    @patch("app.services.task_service.get_db")
    async def test_create_task_starts_queued(self, mock_get_db):
        """Newly created tasks should start in QUEUED status."""
        from app.models.task import TaskCreate
        from app.services.task_service import TaskService

        mock_db = MagicMock()
        mock_result = MagicMock()
        mock_result.inserted_id = "test-id"
        mock_db.tasks.insert_one = AsyncMock(return_value=mock_result)
        mock_db.tasks.find_one = AsyncMock(return_value={
            "_id": "test-id",
            "title": "Test",
            "input": "Test input",
            "status": "queued",
            "assignedAgentId": "agent-1",
            "createdBy": "user",
            "allowDelegation": True,
            "requiresApproval": False,
        })
        mock_get_db.return_value = mock_db

        data = TaskCreate(
            title="Test",
            input="Test input",
            assignedAgentId="agent-1",
        )
        task = await TaskService.create_task(data)

        # Verify the task was created with QUEUED status
        call_args = mock_db.tasks.insert_one.call_args[0][0]
        assert call_args["status"] == "queued"

    @pytest.mark.asyncio
    @patch("app.services.task_service.get_db")
    async def test_count_tasks_by_status(self, mock_get_db):
        """Counting tasks by status should work."""
        from app.services.task_service import TaskService

        mock_db = MagicMock()
        mock_db.tasks.count_documents = AsyncMock(return_value=5)
        mock_get_db.return_value = mock_db

        count = await TaskService.count_tasks(TaskStatus.RUNNING)
        assert count == 5
        mock_db.tasks.count_documents.assert_called_once_with({"status": "running"})


class TestTaskDispatcher:
    """Test the task dispatcher routing."""

    @pytest.mark.asyncio
    @patch("app.utils.task_dispatcher.settings")
    async def test_dispatch_to_background_tasks(self, mock_settings):
        """When USE_CELERY is False, should use BackgroundTasks."""
        mock_settings.USE_CELERY = False

        from app.utils.task_dispatcher import dispatch_task_execution
        from fastapi import BackgroundTasks

        bg_tasks = MagicMock(spec=BackgroundTasks)

        with patch("app.utils.task_dispatcher.Orchestrator") as MockOrch:
            await dispatch_task_execution("task-1", background_tasks=bg_tasks)
            bg_tasks.add_task.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.utils.task_dispatcher.settings")
    async def test_dispatch_to_celery(self, mock_settings):
        """When USE_CELERY is True, should dispatch to Celery."""
        mock_settings.USE_CELERY = True

        from app.utils.task_dispatcher import dispatch_task_execution

        with patch("app.worker.celery_app.celery_execute_task") as mock_celery:
            await dispatch_task_execution("task-1")
            mock_celery.delay.assert_called_once_with("task-1", 0)

    @pytest.mark.asyncio
    @patch("app.utils.task_dispatcher.settings")
    async def test_dispatch_raises_without_bg_tasks(self, mock_settings):
        """Without USE_CELERY and without BackgroundTasks, should raise."""
        mock_settings.USE_CELERY = False

        from app.utils.task_dispatcher import dispatch_task_execution

        with pytest.raises(ValueError, match="background_tasks is required"):
            await dispatch_task_execution("task-1")
