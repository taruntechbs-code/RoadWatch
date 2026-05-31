from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import analytics, authorities, complaints, roads

CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]

app = FastAPI(title="RoadWatch API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def health_payload():
    return {"status": "ok", "project": "RoadWatch"}


@app.get("/")
def root_health_check():
    return health_payload()


@app.get("/health")
def health_check():
    return health_payload()


app.include_router(roads.router, prefix="/roads", tags=["roads"])
app.include_router(complaints.router, prefix="/complaints", tags=["complaints"])
app.include_router(authorities.router, prefix="/authorities", tags=["authorities"])
app.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
