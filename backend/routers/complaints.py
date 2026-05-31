import os
import re
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from supabase import create_client

from database import get_db
from models import Authority, Complaint, RoadSegment
from schemas import (
    ComplaintClassificationResponse,
    ComplaintClassifyRequest,
    ComplaintCreate,
    ComplaintCreateResponse,
    ComplaintDetail,
    ComplaintRouteResponse,
    UploadImageResponse,
)
from services.classifier import classify_complaint
from services.routing import get_sla_days, route_complaint

router = APIRouter()

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_IMAGE_SIZE = 5 * 1024 * 1024
STORAGE_BUCKET = "complaint-media"


def complaint_detail(db, complaint):
    authority_name = None
    assigned_officer = None
    designation = None
    if complaint.assigned_authority_id:
        authority = db.get(Authority, complaint.assigned_authority_id)
        if authority:
            authority_name = authority.department_name
            assigned_officer = authority.officer_name
            designation = authority.designation

    road = db.get(RoadSegment, complaint.road_id) if complaint.road_id else None

    issue_types = complaint.issue_types_json or []
    if not issue_types and complaint.issue_type:
        issue_types = [complaint.issue_type]

    return ComplaintDetail(
        complaint_id=complaint.complaint_id,
        road_id=complaint.road_id,
        road_name=road.road_name if road else None,
        road_type=road.road_type if road else None,
        issue_type=complaint.issue_type,
        issue_types=issue_types,
        severity=complaint.severity,
        description=complaint.description,
        media_url=complaint.media_url,
        lat=complaint.lat,
        lng=complaint.lng,
        status=complaint.status,
        assigned_authority_id=complaint.assigned_authority_id,
        assigned_authority_name=authority_name,
        assigned_officer=assigned_officer,
        designation=designation,
        sla_deadline=complaint.sla_deadline,
        ai_summary=complaint.ai_summary,
        urgency_score=complaint.urgency_score,
        safety_risk=complaint.safety_risk,
        ai_reasoning=complaint.ai_reasoning,
        created_at=complaint.created_at,
    )


def get_supabase_client():
    supabase_url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role_key or service_role_key.startswith("["):
        raise HTTPException(
            status_code=500,
            detail="SUPABASE_SERVICE_ROLE_KEY is required for server-side image uploads.",
        )
    return create_client(supabase_url, service_role_key)


def sanitize_filename(filename):
    name = Path(filename or "complaint-image").name
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._") or "complaint-image"


def ensure_complaint_columns(db):
    columns = {column["name"] for column in inspect(db.bind).get_columns("complaints")}
    dialect = db.bind.dialect.name

    additions = []
    if "issue_types_json" not in columns:
        additions.append(("issue_types_json", "JSONB" if dialect == "postgresql" else "JSON"))
    if "ai_summary" not in columns:
        additions.append(("ai_summary", "TEXT"))
    if "urgency_score" not in columns:
        additions.append(("urgency_score", "INTEGER"))
    if "safety_risk" not in columns:
        additions.append(("safety_risk", "BOOLEAN"))
    if "ai_reasoning" not in columns:
        additions.append(("ai_reasoning", "TEXT"))
    if "assigned_authority_id" not in columns:
        additions.append(("assigned_authority_id", "TEXT"))
    if "sla_deadline" not in columns:
        additions.append(("sla_deadline", "TIMESTAMP" if dialect == "postgresql" else "DATETIME"))

    if not additions:
        return

    for name, column_type in additions:
        if dialect == "postgresql":
            db.execute(text(f"ALTER TABLE complaints ADD COLUMN IF NOT EXISTS {name} {column_type}"))
        else:
            db.execute(text(f"ALTER TABLE complaints ADD COLUMN {name} {column_type}"))
    db.commit()


@router.post("/upload-image", response_model=UploadImageResponse)
async def upload_complaint_image(file: UploadFile = File(...)):
    extension = ALLOWED_IMAGE_TYPES.get(file.content_type or "")
    original_extension = Path(file.filename or "").suffix.lower()
    if not extension or original_extension not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=400, detail="Only jpg, jpeg, png, and webp images are allowed")

    content = await file.read()
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="Image must be 5MB or smaller")

    safe_name = sanitize_filename(file.filename)
    storage_path = f"complaints/{uuid4()}_{safe_name}"
    supabase = get_supabase_client()

    try:
        supabase.storage.from_(STORAGE_BUCKET).upload(
            storage_path,
            content,
            file_options={"content-type": file.content_type, "upsert": "false"},
        )
        public_url = supabase.storage.from_(STORAGE_BUCKET).get_public_url(storage_path)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Image upload failed: {exc}") from exc

    return UploadImageResponse(media_url=public_url)


@router.post("/classify", response_model=ComplaintClassificationResponse)
def classify_complaint_endpoint(payload: ComplaintClassifyRequest, db: Session = Depends(get_db)):
    road_name = None
    if payload.road_id:
        road = db.get(RoadSegment, payload.road_id)
        road_name = road.road_name if road else None

    result = classify_complaint(
        description=payload.description,
        issue_types=payload.issue_types,
        road_name=road_name,
    )
    return ComplaintClassificationResponse(**result)


@router.post("", response_model=ComplaintCreateResponse)
def create_complaint(payload: ComplaintCreate, db: Session = Depends(get_db)):
    ensure_complaint_columns(db)
    road = db.get(RoadSegment, payload.road_id)
    if not road:
        raise HTTPException(status_code=404, detail="Road not found")

    created_at = datetime.utcnow()
    complaint = Complaint(
        complaint_id=str(uuid4()),
        road_id=payload.road_id,
        issue_type=payload.issue_types[0],
        issue_types_json=payload.issue_types,
        severity=payload.severity,
        description=payload.description,
        media_url=payload.media_url,
        lat=payload.lat,
        lng=payload.lng,
        status="Submitted",
        ai_summary=payload.ai_summary,
        urgency_score=payload.urgency_score,
        safety_risk=payload.safety_risk,
        ai_reasoning=payload.ai_reasoning,
        created_at=created_at,
    )
    db.add(complaint)
    db.commit()
    db.refresh(complaint)

    routing_result = route_complaint(complaint.complaint_id, db)
    db.refresh(complaint)

    return ComplaintCreateResponse(
        complaint_id=complaint.complaint_id,
        status=complaint.status,
        created_at=complaint.created_at,
        road_name=road.road_name,
        message="Your complaint has been submitted successfully.",
        assigned_authority_id=complaint.assigned_authority_id,
        assigned_authority_name=routing_result.get("authority_name"),
        assigned_officer=routing_result.get("officer_name"),
        designation=routing_result.get("designation"),
        sla_deadline=complaint.sla_deadline,
        sla_days=routing_result.get("sla_days") if routing_result.get("routed") else None,
    )


@router.get("/road/{road_id}", response_model=list[ComplaintDetail])
def get_road_complaints(road_id: str, db: Session = Depends(get_db)):
    ensure_complaint_columns(db)
    complaints = (
        db.query(Complaint)
        .filter(Complaint.road_id == road_id)
        .order_by(Complaint.created_at.desc())
        .all()
    )
    return [complaint_detail(db, complaint) for complaint in complaints]


@router.post("/{complaint_id}/route", response_model=ComplaintRouteResponse)
def route_complaint_endpoint(
    complaint_id: str,
    force: bool = Query(False),
    db: Session = Depends(get_db),
):
    ensure_complaint_columns(db)
    complaint = db.get(Complaint, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    if complaint.assigned_authority_id and complaint.status == "Routed" and not force:
        authority = db.get(Authority, complaint.assigned_authority_id)
        road = db.get(RoadSegment, complaint.road_id) if complaint.road_id else None
        return ComplaintRouteResponse(
            complaint_id=complaint.complaint_id,
            status=complaint.status,
            assigned_authority_id=complaint.assigned_authority_id,
            assigned_authority_name=authority.department_name if authority else None,
            assigned_officer=authority.officer_name if authority else None,
            designation=authority.designation if authority else None,
            sla_deadline=complaint.sla_deadline,
            sla_days=get_sla_days(complaint.severity, road.road_type if road else None),
            message="Complaint is already routed.",
        )

    routing_result = route_complaint(complaint_id, db)
    db.refresh(complaint)
    return ComplaintRouteResponse(
        complaint_id=complaint.complaint_id,
        status=complaint.status,
        assigned_authority_id=complaint.assigned_authority_id,
        assigned_authority_name=routing_result.get("authority_name"),
        assigned_officer=routing_result.get("officer_name"),
        designation=routing_result.get("designation"),
        sla_deadline=complaint.sla_deadline,
        sla_days=routing_result.get("sla_days") if routing_result.get("routed") else None,
        message=routing_result.get("message"),
    )


@router.get("/{complaint_id}", response_model=ComplaintDetail)
def get_complaint(complaint_id: str, db: Session = Depends(get_db)):
    ensure_complaint_columns(db)
    complaint = db.get(Complaint, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return complaint_detail(db, complaint)
