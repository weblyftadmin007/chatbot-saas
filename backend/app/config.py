from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional
import os


class Settings(BaseSettings):
    # Database
    turso_database_url: str = Field(..., alias="TURSO_DATABASE_URL")
    turso_auth_token: str = Field(..., alias="TURSO_AUTH_TOKEN")

    # Clerk Auth
    clerk_publishable_key: str = Field(..., alias="CLERK_PUBLISHABLE_KEY")
    clerk_secret_key: str = Field(..., alias="CLERK_SECRET_KEY")
    admin_email: str = Field(..., alias="ADMIN_EMAIL")
    # Optional: explicit JWKS URL for token verification. When unset it is
    # derived from the publishable key (https://<frontend-api>/.well-known/jwks.json)
    clerk_jwks_url: Optional[str] = Field(default=None, alias="CLERK_JWKS_URL")

    # Google Apps Script
    gas_webapp_url: str = Field(..., alias="GAS_WEBAPP_URL")

    # Ollama
    ollama_host: str = Field(default="http://localhost:11434")
    ollama_chat_model: str = Field(default="phi3:mini")
    ollama_embed_model: str = Field(default="nomic-embed-text")

    # App
    environment: str = Field(default="production")
    log_level: str = Field(default="INFO")
    widget_cors_origins: str = Field(default="*")

    # Rate limits (per minute)
    widget_rate_limit: int = Field(default=30)
    api_rate_limit: int = Field(default=60)

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()