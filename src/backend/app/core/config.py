from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from loguru import logger

class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.
    """
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_HOST: str
    POSTGRES_PORT: int
    POSTGRES_DB: str

    CENSUS_API_KEY: str
    GEOCODING_API_KEY: str | None = None
    WALKSCORE_API_KEY: str | None = None # Add this line

    @property
    def DATABASE_URL(self) -> str:
        """Constructs the full SQLAlchemy async database URL."""
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding='utf-8',
        case_sensitive=False,
        extra='ignore'
    )

@lru_cache()
def get_settings() -> Settings:
    """Returns the settings instance, cached for efficiency."""
    logger.info("Loading application settings...")
    try:
        settings = Settings()
        logger.info("Application settings loaded successfully.")
        # Be careful not to log sensitive data like passwords
        logger.debug(f"Settings loaded: ENVIRONMENT={settings.ENVIRONMENT}, LOG_LEVEL={settings.LOG_LEVEL}")
        return settings
    except Exception as e:
        logger.critical(f"FATAL: Failed to load application settings: {e}")
        raise

settings = get_settings()
