"""
Tool: write_file — create or overwrite a file on the server.

Files are saved to a configurable output directory.
"""

import os
from app.tools.registry import tool_registry

PARAMS = {
    "type": "object",
    "properties": {
        "filename": {
            "type": "string",
            "description": "Name of the file to create (e.g. 'report.md', 'data.csv'). Must not contain path separators.",
        },
        "content": {
            "type": "string",
            "description": "The text content to write to the file.",
        },
    },
    "required": ["filename", "content"],
}

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "agent_outputs")


async def _handle(filename: str, content: str, **_) -> str:
    # Sanitize filename — no path traversal
    safe_name = os.path.basename(filename)
    if not safe_name or safe_name.startswith("."):
        return "ERROR: Invalid filename."

    # Ensure output directory exists
    abs_dir = os.path.abspath(OUTPUT_DIR)
    os.makedirs(abs_dir, exist_ok=True)

    path = os.path.join(abs_dir, safe_name)

    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return f"File '{safe_name}' written successfully ({len(content)} chars) at {path}"
    except Exception as e:
        return f"Failed to write file: {e}"


tool_registry.register(
    name="write_file",
    description="Create or overwrite a text file on the server. Useful for saving reports, CSV data, markdown documents, or any text output. Files are saved to the agent_outputs directory.",
    parameters=PARAMS,
    handler=_handle,
)
