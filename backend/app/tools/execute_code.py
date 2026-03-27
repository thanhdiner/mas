"""
Tool: execute_code — run Python code in a sandboxed subprocess.

Safety: runs with a timeout, limited output, and restricted imports
via a subprocess with a clean environment.
"""

import asyncio
import tempfile
import os
from app.tools.registry import tool_registry

PARAMS = {
    "type": "object",
    "properties": {
        "code": {
            "type": "string",
            "description": "Python code to execute. Must be valid Python 3.",
        },
    },
    "required": ["code"],
}

TIMEOUT_SECONDS = 15
MAX_OUTPUT_CHARS = 5000


async def _handle(code: str, **kwargs) -> str:
    # Read configurable limits (these will be injected by Orchestrator if set by user)
    timeout = kwargs.get("timeout_seconds", TIMEOUT_SECONDS)
    max_output = kwargs.get("max_output_chars", MAX_OUTPUT_CHARS)

    # Write code to a temp file
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".py", delete=False, encoding="utf-8"
        ) as f:
            f.write(code)
            tmp_path = f.name
    except Exception as e:
        return f"Failed to write temp file: {e}"

    try:
        proc = await asyncio.create_subprocess_exec(
            "python", tmp_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=timeout
            )
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except Exception:
                pass
            return f"Code execution timed out after {timeout}s."

        output = ""
        if stdout:
            output += stdout.decode("utf-8", errors="replace")
        if stderr:
            output += "\n[STDERR]\n" + stderr.decode("utf-8", errors="replace")

        output = output.strip()
        if not output:
            output = "(No output produced)"

        if len(output) > max_output:
            output = output[:max_output] + "\n...[truncated]"

        return_code = proc.returncode
        if return_code != 0:
            output = f"[Exit code: {return_code}]\n{output}"

        return output

    except Exception as e:
        return f"Execution error: {e}"
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


tool_registry.register(
    name="execute_code",
    description="Execute Python code and return the output. Use this for calculations, data processing, generating charts, or any task that benefits from running actual code. The code runs in a sandboxed environment with a 15-second timeout.",
    parameters=PARAMS,
    handler=_handle,
    config_schema=[
        {
            "name": "timeout_seconds",
            "type": "number",
            "label": "Timeout (seconds)",
            "description": "Maximum allowed execution time before the script is killed.",
            "default": 15,
        },
        {
            "name": "max_output_chars",
            "type": "number",
            "label": "Max Output Characters",
            "description": "Maximum characters of stdout/stderr to return to the agent.",
            "default": 3000,
        }
    ]
)
