from database import Base
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import relationship, mapped_column


class RoadSegment(Base):
    __tablename__ = "road_segments"

    road_id = mapped_column(String, primary_key=True)
    road_name = mapped_column(String, nullable=False)
    road_type = mapped_column(String)
    zone = mapped_column(String)
    ward = mapped_column(String)
    length_km = mapped_column(Float)
    start_lat = mapped_column(Float)
    start_lng = mapped_column(Float)
    end_lat = mapped_column(Float)
    end_lng = mapped_column(Float)
    health_score = mapped_column(Integer)

    projects = relationship("ProjectRecord", back_populates="road")
    maintenance_records = relationship("MaintenanceRecord", back_populates="road")
    complaints = relationship("Complaint", back_populates="road")


class ProjectRecord(Base):
    __tablename__ = "project_records"

    project_id = mapped_column(String, primary_key=True)
    road_id = mapped_column(String, ForeignKey("road_segments.road_id"))
    contractor_id = mapped_column(String, ForeignKey("contractors.contractor_id"))
    tender_id = mapped_column(String)
    sanctioned_amount = mapped_column(Float)
    spent_amount = mapped_column(Float)
    start_date = mapped_column(Date)
    end_date = mapped_column(Date)
    status = mapped_column(String)

    road = relationship("RoadSegment", back_populates="projects")
    contractor = relationship("Contractor", back_populates="projects")


class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"

    maintenance_id = mapped_column(String, primary_key=True)
    road_id = mapped_column(String, ForeignKey("road_segments.road_id"))
    last_relaying_date = mapped_column(Date)
    activity_type = mapped_column(String)
    cost = mapped_column(Float)
    contractor_id = mapped_column(String)
    next_scheduled = mapped_column(Date)

    road = relationship("RoadSegment", back_populates="maintenance_records")


class Complaint(Base):
    __tablename__ = "complaints"

    complaint_id = mapped_column(String, primary_key=True)
    road_id = mapped_column(String, ForeignKey("road_segments.road_id"))
    issue_type = mapped_column(String)
    issue_types_json = mapped_column(JSON, nullable=True)
    severity = mapped_column(String)
    description = mapped_column(String)
    media_url = mapped_column(String, nullable=True)
    lat = mapped_column(Float)
    lng = mapped_column(Float)
    status = mapped_column(String, default="Submitted")
    assigned_authority_id = mapped_column(String, nullable=True)
    sla_deadline = mapped_column(DateTime, nullable=True)
    defect_detected = mapped_column(String, nullable=True)
    defect_confidence = mapped_column(Float, nullable=True)
    defect_bbox = mapped_column(JSON, nullable=True)
    ai_summary = mapped_column(String, nullable=True)
    urgency_score = mapped_column(Integer, nullable=True)
    safety_risk = mapped_column(Boolean, nullable=True)
    ai_reasoning = mapped_column(String, nullable=True)
    created_at = mapped_column(DateTime, server_default=func.now())

    road = relationship("RoadSegment", back_populates="complaints")


class Authority(Base):
    __tablename__ = "authorities"

    authority_id = mapped_column(String, primary_key=True)
    department_name = mapped_column(String)
    officer_name = mapped_column(String)
    designation = mapped_column(String)
    road_types_handled = mapped_column(JSON)
    zones_handled = mapped_column(JSON)
    office_contact = mapped_column(String)
    email = mapped_column(String)


class Contractor(Base):
    __tablename__ = "contractors"

    contractor_id = mapped_column(String, primary_key=True)
    name = mapped_column(String)
    gstin = mapped_column(String)
    past_projects_count = mapped_column(Integer)
    active_projects_count = mapped_column(Integer)
    complaint_count = mapped_column(Integer)
    repeat_repair_count = mapped_column(Integer)
    risk_score = mapped_column(Integer)

    projects = relationship("ProjectRecord", back_populates="contractor")
