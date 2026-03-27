from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from pymongo import MongoClient


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in path.read_text().splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        env[key.strip()] = value.strip()
    return env


def build_demo_agents() -> list[dict]:
    return [
        {
            "name": "Demo Chief Orchestrator",
            "role": "Lead coordinator for cross-functional business requests",
            "description": (
                "Receives broad requests, decomposes them into specialist work, "
                "and consolidates the final answer."
            ),
            "systemPrompt": (
                "You are the chief orchestration agent. Clarify the goal, break it "
                "into sensible steps, delegate to the best specialist when useful, "
                "and return a concise executive-ready result."
            ),
            "allowedTools": [],
            "allowedSubAgents": [],
            "maxSteps": 12,
            "active": True,
        },
        {
            "name": "Demo Research Analyst",
            "role": "Research and evidence synthesis specialist",
            "description": (
                "Finds context, compares options, summarizes tradeoffs, and produces "
                "structured research notes."
            ),
            "systemPrompt": (
                "You are a research analyst. Focus on gathering relevant facts, "
                "highlighting tradeoffs, and turning rough questions into clear "
                "decision-ready summaries."
            ),
            "allowedTools": [],
            "allowedSubAgents": [],
            "maxSteps": 10,
            "active": True,
        },
        {
            "name": "Demo Solution Architect",
            "role": "Technical planning and architecture specialist",
            "description": (
                "Turns goals into implementation plans, API contracts, module boundaries, "
                "and technical recommendations."
            ),
            "systemPrompt": (
                "You are a solution architect. Produce implementation plans, data flow "
                "decisions, and pragmatic architecture proposals with clear assumptions."
            ),
            "allowedTools": [],
            "allowedSubAgents": [],
            "maxSteps": 10,
            "active": True,
        },
        {
            "name": "Demo Builder Engineer",
            "role": "Execution-focused implementation specialist",
            "description": (
                "Takes a technical plan and turns it into concrete implementation steps, "
                "checklists, and code-oriented guidance."
            ),
            "systemPrompt": (
                "You are a builder engineer. Be practical, implementation-driven, and "
                "explicit about steps, risks, and rollout details."
            ),
            "allowedTools": [],
            "allowedSubAgents": [],
            "maxSteps": 10,
            "active": True,
        },
        {
            "name": "Demo QA Reviewer",
            "role": "Testing and risk review specialist",
            "description": (
                "Reviews outputs for correctness, edge cases, regressions, and release risk."
            ),
            "systemPrompt": (
                "You are a QA reviewer. Think in terms of risk, reproducibility, edge cases, "
                "and user impact. Return findings first, then coverage gaps."
            ),
            "allowedTools": [],
            "allowedSubAgents": [],
            "maxSteps": 8,
            "active": True,
        },
        {
            "name": "Demo Content Writer",
            "role": "Documentation and polished communication specialist",
            "description": (
                "Turns raw technical output into user-facing copy, summaries, release notes, "
                "and stakeholder updates."
            ),
            "systemPrompt": (
                "You are a content writer. Rewrite material into clear, concise, and polished "
                "communication for end users or stakeholders."
            ),
            "allowedTools": [],
            "allowedSubAgents": [],
            "maxSteps": 8,
            "active": True,
        },
    ]


def main() -> None:
    backend_root = Path(__file__).resolve().parents[1]
    env = load_env(backend_root / ".env")

    client = MongoClient(env["MONGODB_URL"])
    db = client[env["MONGODB_DB"]]
    now = datetime.now(timezone.utc)

    agent_specs = build_demo_agents()
    agent_ids: dict[str, str] = {}

    for spec in agent_specs:
        payload = {
            **spec,
            "updatedAt": now,
        }
        result = db.agents.update_one(
            {"name": spec["name"]},
            {
                "$set": payload,
                "$setOnInsert": {
                    "createdAt": now,
                },
            },
            upsert=True,
        )
        agent_doc = db.agents.find_one({"name": spec["name"]}, {"_id": 1})
        agent_ids[spec["name"]] = str(agent_doc["_id"])

    chief_children = [
        agent_ids["Demo Research Analyst"],
        agent_ids["Demo Solution Architect"],
        agent_ids["Demo Builder Engineer"],
        agent_ids["Demo QA Reviewer"],
        agent_ids["Demo Content Writer"],
    ]

    architect_children = [
        agent_ids["Demo Builder Engineer"],
        agent_ids["Demo QA Reviewer"],
    ]

    builder_children = [
        agent_ids["Demo QA Reviewer"],
        agent_ids["Demo Content Writer"],
    ]

    updates = {
        "Demo Chief Orchestrator": chief_children,
        "Demo Solution Architect": architect_children,
        "Demo Builder Engineer": builder_children,
    }

    for name, allowed_sub_agents in updates.items():
        db.agents.update_one(
            {"name": name},
            {
                "$set": {
                    "allowedSubAgents": allowed_sub_agents,
                    "updatedAt": now,
                }
            },
        )

    print("Seeded demo agents:")
    for spec in agent_specs:
        doc = db.agents.find_one({"name": spec["name"]})
        sub_count = len(doc.get("allowedSubAgents", []))
        print(f"- {doc['name']} | role={doc['role']} | subAgents={sub_count}")


if __name__ == "__main__":
    main()
