from __future__ import annotations

from collections.abc import Mapping
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

DEFAULT_ERROR_CODES: dict[int, str] = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    409: "conflict",
    422: "validation_error",
}


def build_error_payload(
    code: str,
    message: str,
    *,
    detail: Any | None = None,
    **extra: Any,
) -> dict[str, Any]:
    payload = {
        "code": code,
        "message": message,
        "detail": detail if detail is not None else message,
    }
    payload.update(extra)
    return payload


class APIError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        **extra: Any,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.extra = extra

    def to_response(self) -> dict[str, Any]:
        return build_error_payload(self.code, self.message, **self.extra)


class BadRequestError(APIError):
    def __init__(self, code: str, message: str, **extra: Any) -> None:
        super().__init__(400, code, message, **extra)


class NotFoundError(APIError):
    def __init__(self, code: str, message: str, **extra: Any) -> None:
        super().__init__(404, code, message, **extra)


class InvalidObjectIdError(BadRequestError):
    def __init__(self, field_name: str) -> None:
        super().__init__(
            "invalid_object_id",
            f"Invalid '{field_name}'. Expected a 24-character hexadecimal ObjectId.",
            field=field_name,
        )


class DuplicateAgentNameError(BadRequestError):
    def __init__(self, agent_name: str | None = None) -> None:
        suffix = f" '{agent_name}'" if agent_name else ""
        super().__init__(
            "agent_name_exists",
            f"Agent name{suffix} already exists.",
            field="name",
        )


def _status_message(status_code: int) -> str:
    try:
        return HTTPStatus(status_code).phrase
    except ValueError:
        return "Request failed"


def _normalize_http_exception(
    exc: HTTPException,
) -> tuple[str, str, dict[str, Any]]:
    code = DEFAULT_ERROR_CODES.get(exc.status_code, "error")
    message = _status_message(exc.status_code)
    extra: dict[str, Any] = {}

    if isinstance(exc.detail, Mapping):
        if isinstance(exc.detail.get("code"), str):
            code = exc.detail["code"]
        if isinstance(exc.detail.get("message"), str):
            message = exc.detail["message"]
        elif isinstance(exc.detail.get("detail"), str):
            message = exc.detail["detail"]
        extra = {
            key: value
            for key, value in exc.detail.items()
            if key not in {"code", "message", "detail"}
        }
    elif isinstance(exc.detail, str) and exc.detail:
        message = exc.detail

    return code, message, extra


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(APIError)
    async def handle_api_error(_: Request, exc: APIError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=exc.to_response(),
        )

    @app.exception_handler(HTTPException)
    async def handle_http_exception(_: Request, exc: HTTPException) -> JSONResponse:
        code, message, extra = _normalize_http_exception(exc)
        return JSONResponse(
            status_code=exc.status_code,
            content=build_error_payload(code, message, **extra),
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=build_error_payload(
                "validation_error",
                "Request validation failed.",
                errors=exc.errors(),
            ),
        )
