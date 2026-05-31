from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Complaint, Contractor, MaintenanceRecord, ProjectRecord, RoadSegment
from schemas import (
    AnomaliesResponse,
    BudgetOverviewResponse,
    ComplaintHeatmapResponse,
    ContractorScoresResponse,
)

router = APIRouter()


def _money(value):
    return float(value or 0)


def _risk_band(risk_score):
    score = risk_score or 0
    if score >= 75:
        return "High Risk"
    if score >= 50:
        return "Watchlist"
    if score >= 25:
        return "Moderate"
    return "Stable"


def _complaints_by_road(db):
    counts = defaultdict(int)
    for complaint in db.query(Complaint).all():
        if complaint.road_id:
            counts[complaint.road_id] += 1
    return counts


def _latest_project_by_road(db):
    latest = {}
    projects = db.query(ProjectRecord).order_by(ProjectRecord.end_date.desc().nullslast()).all()
    for project in projects:
        if project.road_id and project.road_id not in latest:
            latest[project.road_id] = project
    return latest


def _latest_maintenance_by_road(db):
    latest = {}
    records = db.query(MaintenanceRecord).order_by(MaintenanceRecord.last_relaying_date.desc().nullslast()).all()
    for record in records:
        if record.road_id and record.road_id not in latest:
            latest[record.road_id] = record
    return latest


def _road_budget_rows(db):
    complaint_counts = _complaints_by_road(db)
    rows = {}
    roads = {road.road_id: road for road in db.query(RoadSegment).all()}
    for project in db.query(ProjectRecord).all():
        road = roads.get(project.road_id)
        if not road:
            continue
        row = rows.setdefault(
            road.road_id,
            {
                "road_id": road.road_id,
                "road_name": road.road_name,
                "road_type": road.road_type,
                "zone": road.zone,
                "sanctioned_amount": 0.0,
                "spent_amount": 0.0,
                "complaint_count": complaint_counts.get(road.road_id, 0),
            },
        )
        row["sanctioned_amount"] += _money(project.sanctioned_amount)
        row["spent_amount"] += _money(project.spent_amount)
    return list(rows.values())


def _contractor_budget_rows(db):
    complaint_counts = _complaints_by_road(db)
    contractors = {contractor.contractor_id: contractor for contractor in db.query(Contractor).all()}
    rows = {}
    roads_by_contractor = defaultdict(set)
    complaints_by_contractor = defaultdict(int)

    for project in db.query(ProjectRecord).all():
        contractor = contractors.get(project.contractor_id)
        if not contractor:
            continue
        row = rows.setdefault(
            contractor.contractor_id,
            {
                "contractor_id": contractor.contractor_id,
                "contractor_name": contractor.name,
                "roads_handled": 0,
                "sanctioned_amount": 0.0,
                "spent_amount": 0.0,
                "complaint_count": 0,
                "repeat_repair_count": contractor.repeat_repair_count,
                "risk_score": contractor.risk_score,
            },
        )
        row["sanctioned_amount"] += _money(project.sanctioned_amount)
        row["spent_amount"] += _money(project.spent_amount)
        if project.road_id:
            roads_by_contractor[contractor.contractor_id].add(project.road_id)
            complaints_by_contractor[contractor.contractor_id] += complaint_counts.get(project.road_id, 0)

    for contractor_id, row in rows.items():
        contractor = contractors.get(contractor_id)
        row["roads_handled"] = len(roads_by_contractor[contractor_id])
        row["complaint_count"] = complaints_by_contractor[contractor_id] or (contractor.complaint_count if contractor else 0) or 0
    return list(rows.values())


def _road_anomalies(db):
    today = date.today()
    complaint_counts = _complaints_by_road(db)
    latest_projects = _latest_project_by_road(db)
    latest_maintenance = _latest_maintenance_by_road(db)
    contractors = {contractor.contractor_id: contractor for contractor in db.query(Contractor).all()}
    flagged = []

    for road in db.query(RoadSegment).order_by(RoadSegment.road_id).all():
        complaint_count = complaint_counts.get(road.road_id, 0)
        project = latest_projects.get(road.road_id)
        maintenance = latest_maintenance.get(road.road_id)
        last_relaying_date = maintenance.last_relaying_date if maintenance else None
        sanctioned = _money(project.sanctioned_amount if project else None)
        spent = _money(project.spent_amount if project else None)
        flags = []

        days_since_repair = (today - last_relaying_date).days if last_relaying_date else None
        if days_since_repair is not None and days_since_repair <= 180 and complaint_count > 3:
            flags.append("Recent repair but multiple complaints")
        if sanctioned > 0 and spent >= 0.90 * sanctioned and complaint_count > 5:
            flags.append("High spend with repeated failures")
        if days_since_repair is not None and days_since_repair <= 365 and (road.health_score or 0) < 40:
            flags.append("Poor health despite recent work")

        if flags:
            contractor = contractors.get(project.contractor_id) if project else None
            flagged.append(
                {
                    "road_id": road.road_id,
                    "road_name": road.road_name,
                    "zone": road.zone,
                    "contractor_id": contractor.contractor_id if contractor else None,
                    "contractor_name": contractor.name if contractor else None,
                    "complaint_count": complaint_count,
                    "sanctioned_amount": sanctioned,
                    "spent_amount": spent,
                    "last_relaying_date": last_relaying_date,
                    "health_score": road.health_score,
                    "anomaly_flags": flags,
                }
            )
    return flagged


@router.get("/budget-overview", response_model=BudgetOverviewResponse)
def budget_overview(db: Session = Depends(get_db)):
    return {
        "by_road": sorted(_road_budget_rows(db), key=lambda item: item["sanctioned_amount"], reverse=True),
        "by_contractor": sorted(_contractor_budget_rows(db), key=lambda item: item["sanctioned_amount"], reverse=True),
    }


@router.get("/complaint-heatmap", response_model=ComplaintHeatmapResponse)
def complaint_heatmap(db: Session = Depends(get_db)):
    grouped = {}
    roads = {road.road_id: road for road in db.query(RoadSegment).all()}
    complaints = db.query(Complaint).filter(Complaint.lat.isnot(None), Complaint.lng.isnot(None)).all()
    for complaint in complaints:
        road_id = complaint.road_id
        if not road_id:
            continue
        row = grouped.setdefault(road_id, {"lat_total": 0.0, "lng_total": 0.0, "count": 0})
        row["lat_total"] += float(complaint.lat)
        row["lng_total"] += float(complaint.lng)
        row["count"] += 1

    points = []
    for road_id, row in grouped.items():
        road = roads.get(road_id)
        if not road or row["count"] == 0:
            continue
        points.append(
            {
                "lat": row["lat_total"] / row["count"],
                "lng": row["lng_total"] / row["count"],
                "intensity": row["count"],
                "road_id": road_id,
                "road_name": road.road_name,
                "zone": road.zone,
                "complaint_count": row["count"],
            }
        )
    return {"points": sorted(points, key=lambda item: item["complaint_count"], reverse=True)}


@router.get("/contractor-scores", response_model=ContractorScoresResponse)
def contractor_scores(db: Session = Depends(get_db)):
    budget_rows = {row["contractor_id"]: row for row in _contractor_budget_rows(db)}
    flagged_counts = defaultdict(int)
    for road in _road_anomalies(db):
        if road.get("contractor_id"):
            flagged_counts[road["contractor_id"]] += 1

    contractors = []
    for contractor in db.query(Contractor).order_by(Contractor.contractor_id).all():
        budget = budget_rows.get(contractor.contractor_id, {})
        contractors.append(
            {
                "contractor_id": contractor.contractor_id,
                "contractor_name": contractor.name,
                "roads_handled": budget.get("roads_handled", contractor.past_projects_count or 0),
                "active_projects_count": contractor.active_projects_count,
                "complaint_count": budget.get("complaint_count", contractor.complaint_count or 0),
                "repeat_repair_count": contractor.repeat_repair_count,
                "flagged_roads_count": flagged_counts.get(contractor.contractor_id, 0),
                "risk_score": contractor.risk_score,
                "performance_band": _risk_band(contractor.risk_score),
            }
        )
    return {"contractors": sorted(contractors, key=lambda item: (item["risk_score"] or 0, item["complaint_count"]), reverse=True)}


@router.get("/anomalies", response_model=AnomaliesResponse)
def anomalies(db: Session = Depends(get_db)):
    road_rows = _road_anomalies(db)
    flagged_counts = defaultdict(int)
    for road in road_rows:
        if road.get("contractor_id"):
            flagged_counts[road["contractor_id"]] += 1

    contractor_rows = []
    contractors = {contractor.contractor_id: contractor for contractor in db.query(Contractor).all()}
    for contractor_id, flagged_count in flagged_counts.items():
        if flagged_count <= 2:
            continue
        contractor = contractors.get(contractor_id)
        risk_score = contractor.risk_score if contractor else 0
        contractor_rows.append(
            {
                "contractor_id": contractor_id,
                "contractor_name": contractor.name if contractor else None,
                "flagged_roads_count": flagged_count,
                "risk_score": risk_score,
                "adjusted_risk_score": min(100, (risk_score or 0) + flagged_count * 5),
                "anomaly_flags": ["Multiple flagged roads under same contractor"],
            }
        )

    clean_road_rows = [{key: value for key, value in row.items() if key != "contractor_id"} for row in road_rows]
    return {
        "roads": sorted(clean_road_rows, key=lambda item: item["complaint_count"], reverse=True),
        "contractors": sorted(contractor_rows, key=lambda item: item["adjusted_risk_score"], reverse=True),
    }
