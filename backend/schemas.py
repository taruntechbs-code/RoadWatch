from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RoadListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    road_id: str
    road_name: str
    road_type: str | None
    zone: str | None
    ward: str | None
    health_score: int | None
    start_lat: float | None
    start_lng: float | None
    end_lat: float | None
    end_lng: float | None


class ProjectSummary(BaseModel):
    contractor_name: str | None
    tender_id: str | None
    sanctioned_amount: float | None
    spent_amount: float | None
    status: str | None


class MaintenanceSummary(BaseModel):
    last_relaying_date: date | None
    activity_type: str | None
    days_since_repair: int | None
    next_scheduled: date | None = None


class AuthoritySummary(BaseModel):
    department_name: str | None
    officer_name: str | None
    designation: str | None
    contact: str | None


class ComplaintSummary(BaseModel):
    total_complaints: int
    open_complaints: int
    latest_descriptions: list[str]


class RoadDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    road_id: str
    road_name: str
    road_type: str | None
    zone: str | None
    ward: str | None
    length_km: float | None
    start_lat: float | None
    start_lng: float | None
    end_lat: float | None
    end_lng: float | None
    health_score: int | None
    latest_project: ProjectSummary | None
    latest_maintenance: MaintenanceSummary | None
    assigned_authority: AuthoritySummary | None
    complaint_summary: ComplaintSummary


class ComplaintCreate(BaseModel):
    road_id: str
    description: str
    issue_type: str | None = None
    issue_types: list[str] = Field(default_factory=list)
    lat: float
    lng: float
    media_url: str | None = None
    severity: str = "Medium"
    ai_summary: str | None = None
    urgency_score: int | None = None
    safety_risk: bool | None = None
    ai_reasoning: str | None = None

    @model_validator(mode="after")
    def normalize_issue_types(self):
        if not self.issue_types and self.issue_type:
            self.issue_types = [self.issue_type]
        if not self.issue_types:
            raise ValueError("At least one issue type is required")
        self.issue_types = [issue.strip() for issue in self.issue_types if issue.strip()]
        if not self.issue_types:
            raise ValueError("At least one issue type is required")
        self.issue_type = self.issue_types[0]
        return self


class ComplaintCreateResponse(BaseModel):
    complaint_id: str
    status: str
    created_at: datetime
    road_name: str
    message: str
    assigned_authority_id: str | None = None
    assigned_authority_name: str | None = None
    assigned_officer: str | None = None
    designation: str | None = None
    sla_deadline: datetime | None = None
    sla_days: int | None = None


class ComplaintDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    complaint_id: str
    road_id: str
    road_name: str | None = None
    road_type: str | None = None
    issue_type: str | None
    issue_types: list[str] = Field(default_factory=list)
    severity: str | None
    description: str | None
    media_url: str | None
    lat: float | None
    lng: float | None
    status: str | None
    assigned_authority_id: str | None
    assigned_authority_name: str | None = None
    assigned_officer: str | None = None
    designation: str | None = None
    sla_deadline: datetime | None
    ai_summary: str | None = None
    urgency_score: int | None = None
    safety_risk: bool | None = None
    ai_reasoning: str | None = None
    created_at: datetime | None


class UploadImageResponse(BaseModel):
    media_url: str


class ComplaintRouteResponse(BaseModel):
    complaint_id: str
    status: str | None
    assigned_authority_id: str | None = None
    assigned_authority_name: str | None = None
    assigned_officer: str | None = None
    designation: str | None = None
    sla_deadline: datetime | None = None
    sla_days: int | None = None
    message: str | None = None


class ComplaintClassifyRequest(BaseModel):
    description: str
    issue_types: list[str] = Field(default_factory=list)
    road_id: str | None = None


class ComplaintClassificationResponse(BaseModel):
    normalized_issue_types: list[str]
    severity: str
    safety_risk: bool
    urgency_score: int
    summary_english: str
    reasoning: str
    provider_used: str


class AuthorityDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    authority_id: str
    department_name: str | None
    officer_name: str | None
    designation: str | None
    road_types_handled: list[str] | dict[str, Any] | None
    zones_handled: list[str] | dict[str, Any] | None
    office_contact: str | None
    email: str | None
