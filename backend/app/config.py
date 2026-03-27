from pydantic_settings import BaseSettings
from functools import lru_cache
from pydantic import field_validator


class Settings(BaseSettings):
    # App
    APP_NAME: str = "MAS - Multi-Agent System"
    DEBUG: bool = True
    API_PREFIX: str = "/api"

    # MongoDB
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB: str = "mas_db"

    # Auth
    JWT_SECRET_KEY: str = "super-secret-key-change-it-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 7 days

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"

    # Orchestration limits
    MAX_DELEGATION_DEPTH: int = 5
    MAX_STEPS_DEFAULT: int = 10

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Cloudinary
    CLOUDINARY_URL: str = ""

    @field_validator("OPENAI_API_KEY", mode="before")
    @classmethod
    def normalize_openai_api_key(cls, value: str) -> str:
        if value is None:
            return ""

        normalized = str(value).strip()
        if normalized == "sk-your-openai-api-key-here":
            return ""
        return normalized

    @field_validator("REDIS_URL")
    @classmethod
    def validate_redis_url(cls, value: str) -> str:
        if not value.startswith(("redis://", "rediss://")):
            raise ValueError("REDIS_URL must start with redis:// or rediss://")
        return value

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()
