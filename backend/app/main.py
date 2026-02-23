from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings

app = FastAPI(
    title="EdificioApp API",
    version="0.1.0",
    description="API para administración de edificios y condominios en Chile",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


from app.routers.buildings import router as buildings_router, router_floors
from app.routers.charges import router as charges_router
from app.routers.payments import router as payments_router
from app.routers.notifications import router as notifications_router
from app.routers.webpay import router as webpay_router
from app.routers.residents import router as residents_router

app.include_router(buildings_router)
app.include_router(router_floors)
app.include_router(charges_router)
app.include_router(payments_router)
app.include_router(notifications_router)
app.include_router(webpay_router)
app.include_router(residents_router)


@app.get("/health")
def health():
    return {"status": "ok"}
