from datetime import datetime, timedelta

from models import Authority, Complaint, RoadSegment


SLA_BY_SEVERITY = {
    "critical": 2,
    "high": 3,
    "medium": 7,
    "low": 10,
}


def _as_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        return list(value.values())
    return [value]


def _normalized_items(value):
    return {str(item).strip().lower() for item in _as_list(value) if str(item).strip()}


def _handles_road_type(authority, road_type):
    return road_type.lower() in _normalized_items(authority.road_types_handled)


def _handles_zone(authority, zone):
    if not zone:
        return False
    zones = {str(item).strip() for item in _as_list(authority.zones_handled) if str(item).strip()}
    return zone in zones


def get_sla_days(severity, road_type):
    severity_key = (severity or "").strip().lower()
    if severity_key in SLA_BY_SEVERITY:
        return SLA_BY_SEVERITY[severity_key]
    if (road_type or "").strip().lower() == "nh":
        return 5
    return SLA_BY_SEVERITY["medium"]


def _authority_payload(authority, road, sla_days):
    return {
        "assigned_authority_id": authority.authority_id if authority else None,
        "authority_name": authority.department_name if authority else None,
        "officer_name": authority.officer_name if authority else None,
        "designation": authority.designation if authority else None,
        "road_type": road.road_type if road else None,
        "zone": road.zone if road else None,
        "sla_days": sla_days,
        "routed": authority is not None,
        "message": None if authority else "No matching authority found. Manual review required.",
    }


def _select_authority(authorities, road):
    road_type = (road.road_type or "").strip()
    road_type_key = road_type.lower()
    zone = (road.zone or "").strip()

    capable = [authority for authority in authorities if _handles_road_type(authority, road_type)]
    if not capable:
        return None

    if road_type_key == "nh":
        preferred = [
            authority
            for authority in capable
            if "nhai" in (authority.department_name or "").lower()
            or "national highways" in (authority.department_name or "").lower()
        ]
        return preferred[0] if preferred else capable[0]

    if road_type_key == "sh":
        zone_matches = [authority for authority in capable if _handles_zone(authority, zone)]
        return zone_matches[0] if zone_matches else capable[0]

    if road_type_key == "corporation":
        zone_matches = [authority for authority in capable if _handles_zone(authority, zone)]
        return zone_matches[0] if zone_matches else capable[0]

    if road_type_key == "panchayat":
        preferred = [
            authority
            for authority in capable
            if "drda" in (authority.department_name or "").lower()
            or "rural" in (authority.department_name or "").lower()
        ]
        return preferred[0] if preferred else capable[0]

    return capable[0]


def route_complaint(complaint_id: str, db_session) -> dict:
    complaint = db_session.get(Complaint, complaint_id)
    if not complaint:
        return {
            "assigned_authority_id": None,
            "authority_name": None,
            "officer_name": None,
            "designation": None,
            "road_type": None,
            "zone": None,
            "sla_days": None,
            "routed": False,
            "message": "Complaint not found.",
        }

    road = db_session.get(RoadSegment, complaint.road_id) if complaint.road_id else None
    if not road:
        return {
            "assigned_authority_id": None,
            "authority_name": None,
            "officer_name": None,
            "designation": None,
            "road_type": None,
            "zone": None,
            "sla_days": None,
            "routed": False,
            "message": "Road not found. Manual review required.",
        }

    sla_days = get_sla_days(complaint.severity, road.road_type)
    authorities = db_session.query(Authority).order_by(Authority.authority_id).all()
    authority = _select_authority(authorities, road)

    if not authority:
        complaint.assigned_authority_id = None
        complaint.sla_deadline = None
        complaint.status = "Submitted"
        db_session.add(complaint)
        db_session.commit()
        db_session.refresh(complaint)
        return _authority_payload(None, road, sla_days)

    complaint.assigned_authority_id = authority.authority_id
    complaint.status = "Routed"
    complaint.sla_deadline = datetime.utcnow() + timedelta(days=sla_days)
    db_session.add(complaint)
    db_session.commit()
    db_session.refresh(complaint)

    return _authority_payload(authority, road, sla_days)
