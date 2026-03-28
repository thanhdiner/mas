"""
Orchestrator – the core agent runtime engine.

Responsibilities:
  1. Read task
  2. Decide solve-or-delegate via LLM
  3. Create subtask if delegating
  4. Execute real tools (web_search, read_website, execute_code, write_file)
  5. Wait / collect subtask result
  6. Finalize parent task

Safety: tracks delegation depth to prevent infinite loops.
Uses the unified LLM Provider for multi-model support.
"""

import json
from typing import Optional

from app.config import get_settings
from app.models.task import TaskStatus, TaskCreate
from app.models.execution import ExecutionStatus, StepType
from app.services.agent_service import AgentService
from app.services.task_service import TaskService
from app.services.execution_service import ExecutionService
from app.services.llm_provider import get_llm_provider
from app.utils.websocket_manager import ws_manager
from app.tools.registry import tool_registry

settings = get_settings()

DELEGATION_TOOL = {
    "type": "function",
    "function": {
        "name": "delegate_to_agent",
        "description": "Delegate a subtask to another agent. Use this when the task requires specialized expertise from a sub-agent.",
        "parameters": {
            "type": "object",
            "properties": {
                "agent_id": {
                    "type": "string",
                    "description": "The ID of the agent to delegate to",
                },
                "subtask_title": {
                    "type": "string",
                    "description": "A clear title for the subtask",
                },
                "subtask_input": {
                    "type": "string",
                    "description": "Detailed input/instructions for the subtask",
                },
            },
            "required": ["agent_id", "subtask_title", "subtask_input"],
        },
    },
}


class Orchestrator:

    @staticmethod
    def _get_agent_model(agent) -> tuple[str, Optional[str]]:
        """
        Resolve the model and provider for an agent.
        Returns (model_name, provider_override_or_none).
        
        Priority: agent.model > settings.LLM_MODEL > settings.OPENAI_MODEL
        """
        agent_model = getattr(agent, "model", None)
        agent_provider = getattr(agent, "provider", None)

        if agent_model:
            return agent_model, agent_provider
        
        # Fall back to global settings
        return settings.LLM_MODEL or settings.OPENAI_MODEL, None

    @staticmethod
    async def execute_task(task_id: str, depth: int = 0):
        """Main entry point for executing a task."""
        max_depth = settings.MAX_DELEGATION_DEPTH

        if depth > max_depth:
            await TaskService.update_task_status(
                task_id,
                TaskStatus.FAILED,
                error=f"Maximum delegation depth ({max_depth}) exceeded. Possible infinite loop.",
            )
            return

        task = await TaskService.get_task(task_id)
        if not task:
            return

        agent = await AgentService.get_agent(task.assignedAgentId)
        if not agent:
            await TaskService.update_task_status(
                task_id, TaskStatus.FAILED, error="Assigned agent not found"
            )
            return

        if not agent.active:
            await TaskService.update_task_status(
                task_id, TaskStatus.FAILED, error="Assigned agent is inactive"
            )
            return

        # Update task to running
        await TaskService.update_task_status(task_id, TaskStatus.RUNNING)

        # Create execution record
        execution = await ExecutionService.create_execution(task_id, task.assignedAgentId)

        await ws_manager.broadcast(execution.id, {
            "type": "execution_started",
            "taskId": task_id,
            "agentId": task.assignedAgentId,
            "agentName": agent.name,
        })

        try:
            await Orchestrator._run_agent(task, agent, execution, depth)
        except Exception as e:
            await ExecutionService.add_step(
                execution.id, task_id, task.assignedAgentId,
                StepType.ERROR, str(e),
            )
            await ExecutionService.complete_execution(
                execution.id, ExecutionStatus.FAILED
            )
            await TaskService.update_task_status(
                task_id, TaskStatus.FAILED, error=str(e)
            )
            await ws_manager.broadcast(execution.id, {
                "type": "execution_failed",
                "error": str(e),
            })

    @staticmethod
    async def _run_agent(task, agent, execution, depth: int):
        """Run the LLM agent loop using the unified LLM provider."""
        llm = get_llm_provider()
        model, provider = Orchestrator._get_agent_model(agent)

        # Build system prompt
        system_msg = agent.systemPrompt + "\n\n"
        system_msg += f"You are '{agent.name}' with role: {agent.role}.\n"
        system_msg += f"Your description: {agent.description}\n\n"

        if agent.allowedSubAgents and task.allowDelegation:
            sub_agents = []
            for sa_id in agent.allowedSubAgents:
                sa = await AgentService.get_agent(sa_id)
                if sa and sa.active:
                    sub_agents.append(f"- {sa.name} (ID: {sa.id}): {sa.role} – {sa.description}")
            if sub_agents:
                system_msg += "You can delegate subtasks to these agents:\n"
                system_msg += "\n".join(sub_agents)
                system_msg += "\n\nUse the delegate_to_agent function if a subtask is better handled by a specialist.\n"
            else:
                system_msg += "No sub-agents are currently available.\n"
        else:
            system_msg += "You must handle this task directly without delegation.\n"

        system_msg += f"\nMaximum steps allowed: {agent.maxSteps}\n"
        system_msg += "Provide a clear, complete answer to the task.\n"

        messages = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": f"Task: {task.title}\n\nInput:\n{task.input}"},
        ]

        # Add step: thinking
        await ExecutionService.add_step(
            execution.id, task.id, agent.id,
            StepType.THINKING,
            f"Agent '{agent.name}' is analyzing the task (model: {model})...",
        )
        await ws_manager.broadcast(execution.id, {
            "type": "step",
            "stepType": "thinking",
            "agentId": agent.id,
            "agentName": agent.name,
            "content": f"Agent '{agent.name}' is analyzing the task (model: {model})...",
        })

        # Prepare tools — real tools from registry + delegation
        tools = []
        if agent.allowedTools:
            tools.extend(tool_registry.get_openai_tools(agent.allowedTools))
        if agent.allowedSubAgents and task.allowDelegation:
            tools.append(DELEGATION_TOOL)

        step_count = 0
        max_steps = agent.maxSteps

        while step_count < max_steps:
            step_count += 1

            response = await llm.chat(
                model=model,
                messages=messages,
                tools=tools if tools else None,
                temperature=0.7,
                max_tokens=2000,
                provider=provider,
            )

            # Check for tool calls (delegation OR real tools)
            if response.message.tool_calls:
                # Build assistant message with tool_calls for the conversation history
                tool_calls_for_msg = [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.name,
                            "arguments": tc.arguments,
                        },
                    }
                    for tc in response.message.tool_calls
                ]
                messages.append({
                    "role": "assistant",
                    "content": response.message.content or "",
                    "tool_calls": tool_calls_for_msg,
                })

                for tc in response.message.tool_calls:
                    fn_name = tc.name

                    try:
                        args = json.loads(tc.arguments or "{}")
                    except json.JSONDecodeError as e:
                        tool_result = f"ERROR: Invalid tool arguments: {e.msg}"
                        await ExecutionService.add_step(
                            execution.id, task.id, agent.id,
                            StepType.ERROR, tool_result,
                        )
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tc.id,
                            "content": tool_result,
                        })
                        continue

                    if fn_name == "delegate_to_agent":
                        # Delegation — existing logic
                        tool_result = await Orchestrator._handle_delegation(
                            task, agent, execution, args, depth
                        )
                    else:
                        # Real tool execution
                        handler = tool_registry.get_handler(fn_name)
                        if handler is None:
                            tool_result = f"ERROR: Unknown tool '{fn_name}'."
                        else:
                            # Log tool call start
                            args_summary = ", ".join(f"{k}={repr(v)[:60]}" for k, v in args.items())
                            await ExecutionService.add_step(
                                execution.id, task.id, agent.id,
                                StepType.TOOL_CALL,
                                f"Calling {fn_name}({args_summary})",
                                meta={"tool": fn_name, "args": args},
                            )
                            await ws_manager.broadcast(execution.id, {
                                "type": "tool_call",
                                "agentId": agent.id,
                                "agentName": agent.name,
                                "tool": fn_name,
                                "args": args,
                                "content": f"Calling {fn_name}({args_summary})",
                            })

                            # Execute the real tool handler
                            try:
                                from app.database import get_db
                                current_db = get_db()
                                global_settings_doc = await current_db.tool_settings.find_one({"name": fn_name}) if current_db is not None else {}
                                global_settings = (global_settings_doc or {}).get("settings", {})

                                agent_tool_config = getattr(agent, "toolConfig", {}).get(fn_name, {})
                                combined_args = {**global_settings, **agent_tool_config, **args}
                                tool_result = await handler(**combined_args)
                            except Exception as exc:
                                tool_result = f"Tool execution error: {exc}"

                            # Log tool result
                            result_preview = (tool_result or "")[:500]
                            await ExecutionService.add_step(
                                execution.id, task.id, agent.id,
                                StepType.TOOL_CALL,
                                f"[{fn_name} result] {result_preview}",
                                meta={"tool": fn_name, "resultLength": len(tool_result or "")},
                            )
                            await ws_manager.broadcast(execution.id, {
                                "type": "tool_result",
                                "agentId": agent.id,
                                "agentName": agent.name,
                                "tool": fn_name,
                                "content": result_preview,
                            })

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": tool_result or "Tool completed but returned no result.",
                    })
                continue

            # Final answer
            content = response.message.content or ""

            await ExecutionService.add_step(
                execution.id, task.id, agent.id,
                StepType.RESULT, content,
            )

            # Check if approval is required
            if task.requiresApproval:
                await TaskService.update_task_status(
                    task.id, TaskStatus.WAITING_APPROVAL, result=content
                )
                await ExecutionService.add_step(
                    execution.id, task.id, agent.id,
                    StepType.WAITING, "Waiting for approval...",
                )
                await ws_manager.broadcast(execution.id, {
                    "type": "waiting_approval",
                    "agentId": agent.id,
                    "agentName": agent.name,
                    "result": content,
                })
            else:
                await TaskService.update_task_status(
                    task.id, TaskStatus.DONE, result=content
                )
                await ExecutionService.complete_execution(
                    execution.id, ExecutionStatus.COMPLETED
                )
                await ws_manager.broadcast(execution.id, {
                    "type": "execution_completed",
                    "agentId": agent.id,
                    "agentName": agent.name,
                    "result": content,
                })
            return

        # Exceeded max steps
        await ExecutionService.add_step(
            execution.id, task.id, agent.id,
            StepType.ERROR,
            f"Agent exceeded maximum steps ({max_steps})",
        )
        await ExecutionService.complete_execution(
            execution.id, ExecutionStatus.FAILED
        )
        await TaskService.update_task_status(
            task.id, TaskStatus.FAILED,
            error=f"Exceeded maximum steps ({max_steps})",
        )

    @staticmethod
    async def _handle_delegation(task, agent, execution, args: dict, depth: int) -> Optional[str]:
        """Handle a delegation request from the LLM."""
        target_agent_id = args.get("agent_id", "")
        subtask_title = args.get("subtask_title", "Subtask")
        subtask_input = args.get("subtask_input", "")

        # Validate agent is in allowed list
        if target_agent_id not in agent.allowedSubAgents:
            msg = f"Agent '{target_agent_id}' is not in allowed sub-agents list."
            await ExecutionService.add_step(
                execution.id, task.id, agent.id,
                StepType.ERROR, msg,
            )
            return f"ERROR: {msg}"

        target_agent = await AgentService.get_agent(target_agent_id)
        if not target_agent or not target_agent.active:
            msg = "Target agent not found or inactive."
            await ExecutionService.add_step(
                execution.id, task.id, agent.id,
                StepType.ERROR, msg,
            )
            return f"ERROR: {msg}"

        # Log delegation step
        await ExecutionService.add_step(
            execution.id, task.id, agent.id,
            StepType.DELEGATION,
            f"Delegating to '{target_agent.name}': {subtask_title}",
            meta={
                "targetAgentId": target_agent_id,
                "targetAgentName": target_agent.name,
                "subtaskTitle": subtask_title,
            },
        )
        await ws_manager.broadcast(execution.id, {
            "type": "delegation",
            "fromAgentId": agent.id,
            "fromAgent": agent.name,
            "toAgentId": target_agent_id,
            "toAgent": target_agent.name,
            "subtaskTitle": subtask_title,
        })

        # Create subtask
        subtask_data = TaskCreate(
            title=subtask_title,
            input=subtask_input,
            assignedAgentId=target_agent_id,
            parentTaskId=task.id,
            createdBy=f"agent:{agent.id}",
            allowDelegation=task.allowDelegation,
            requiresApproval=False,
        )
        subtask = await TaskService.create_task(subtask_data)

        # Execute subtask recursively (depth + 1)
        await Orchestrator.execute_task(subtask.id, depth=depth + 1)

        # Get subtask result
        updated_subtask = await TaskService.get_task(subtask.id)
        if updated_subtask and updated_subtask.status == TaskStatus.DONE:
            return updated_subtask.result
        elif updated_subtask and updated_subtask.error:
            return f"Subtask failed: {updated_subtask.error}"
        else:
            return "Subtask completed without a result."
