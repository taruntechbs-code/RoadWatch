from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="RoadWatch API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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
