from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""
    FRONTEND_URL: str = "http://localhost:3000"
    TRANSBANK_COMMERCE_CODE: str = "597055555532"  # Transbank test code
    TRANSBANK_API_KEY: str = "579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C"
    FINTOC_SECRET_KEY: str = ""
    ENVIRONMENT: str = "development"  # development | production

    class Config:
        env_file = ".env"


settings = Settings()
