"""
Centralised MongoDB-document → Pydantic-model parser.

Every Response model in this codebase has an ``id: str`` field that
corresponds to MongoDB's ``_id`` (an ObjectId).  This utility handles
the conversion once so individual services no longer need handwritten
``_doc_to_response`` helpers.

Usage::

    from app.utils.doc_parser import doc_to_model

    agent = doc_to_model(doc, AgentResponse)
"""

from __future__ import annotations

from typing import TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


def doc_to_model(doc: dict, model: type[T], **overrides) -> T:
    """Convert a raw MongoDB document into a Pydantic *model* instance.

    Steps:
    1.  Copy ``doc`` so the caller's dict is never mutated.
    2.  Stringify ``_id`` → ``id`` (Pydantic models use ``id: str``).
    3.  Apply caller-supplied **overrides** (e.g. ``agent_name``).
    4.  Delegate to ``model.model_validate`` which:
        • coerces compatible types (e.g. ``ObjectId`` → ignored field),
        • fills in defaults from the schema,
        • raises ``ValidationError`` if the document shape is wrong.

    Parameters
    ----------
    doc:
        Raw dict returned by a Motor/PyMongo query.
    model:
        The target Pydantic ``BaseModel`` subclass.
    **overrides:
        Extra keyword arguments merged on top of the doc before
        validation (handy for injected fields like ``agentName``).
    """
    data = dict(doc)

    # _id → id
    if "_id" in data:
        data.setdefault("id", str(data.pop("_id")))

    # Merge overrides
    data.update(overrides)

    return model.model_validate(data)
