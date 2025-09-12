from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.
    Pydantic will automatically read from the .env file and validate the types.
    """
    # --- Application Settings ---
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    # --- Database Connection ---
    # These are required and will raise an error on startup if not found.
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_HOST: str
    POSTGRES_PORT: int
    POSTGRES_DB: str

    # --- External API Keys ---
    CENSUS_API_KEY: str

    # Optional key, defaults to None if not present
    GEOCODING_API_KEY: str | None = None

    @property
    def DATABASE_URL(self) -> str:
        """Constructs the full SQLAlchemy database URL."""
        return f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # Pydantic model configuration
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding='utf-8',
        case_sensitive=False, # Allows CENSUS_API_KEY=... instead of census_api_key=...
        extra='ignore'
    )

@lru_cache()
def get_settings() -> Settings:
    """
    Returns the settings instance. Using lru_cache ensures the .env file is read
    only once, making it an efficient singleton.
    """
    return Settings()

# Create a single instance that can be imported throughout the application
settings = get_settings()