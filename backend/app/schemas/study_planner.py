from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Any, Dict, List, Optional, Self

from app.db.models.study_plan import DEFAULT_INITIAL_READINESS_SCORE
from pydantic import (AliasChoices, BaseModel, Field, computed_field,
                      model_validator)


class StudySessionResponse(BaseModel):
    id: uuid.UUID
    study_plan_id: uuid.UUID
    title: str
    topic: str
    session_type: str
    scheduled_start: datetime
    scheduled_end: datetime
    duration_minutes: int
    status: str
    completed_at: Optional[datetime] = None
    understanding_level: Optional[str] = None
    difficulty_rating: Optional[str] = None
    confidence_rating: Optional[int] = None
    feedback_notes: Optional[str] = None
    checklist_items: List[Dict[str, Any]] = []
    quiz_questions: List[Dict[str, Any]] = []
    recommended_resource_ids: List[str] = []
    lesson_sections_json: List[Dict[str, Any]] = []
    lesson_plan_json: Optional[Dict[str, Any]] = None
    lesson_status: str = "NOT_GENERATED"
    current_section_index: int = 0
    lesson_generated_at: Optional[datetime] = None
    knowledge_check_answers: Optional[Dict[str, Any]] = None
    knowledge_check_score: Optional[float] = None
    knowledge_check_report: Optional[Dict[str, Any]] = None
    session_summary_text: Optional[str] = None
    student_notes: Optional[str] = None
    tutor_chat_history: List[Dict[str, Any]] = []


class SaveSessionNotesRequest(BaseModel):
    student_notes: str = Field(default="", description="Personal notes written by the student for this study session")


class GuidedSessionAskRequest(BaseModel):
    question: str = Field(min_length=1)
    section_context: Optional[str] = Field(default="")


class GuidedSessionExerciseRequest(BaseModel):
    section_index: Optional[int] = Field(default=0)


class SubmitKnowledgeCheckRequest(BaseModel):
    answers: Dict[str, Any] = Field(default_factory=dict)


class StudyPlanResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    title: str
    study_type: str
    course_id: Optional[uuid.UUID] = None
    teaching_workspace_id: Optional[uuid.UUID] = None
    assessment_id: Optional[uuid.UUID] = None
    start_date: datetime
    end_date: datetime
    available_days: List[str] = []
    blackout_dates: List[str] = []
    preferred_time_start: str
    preferred_time_end: str
    session_duration_minutes: int
    daily_goal: str
    preferred_difficulty: str = "Balanced"
    reminder_preference_minutes: int
    reminder_channels: List[str] = []
    priority: str
    status: str
    auto_generated: bool = False
    streak_count: int = 0
    readiness_score: int = DEFAULT_INITIAL_READINESS_SCORE
    readiness_history: List[Dict[str, Any]] = []
    covered_material_ids: List[str] = []
    created_at: datetime
    sessions: List[StudySessionResponse] = []


class CreateStudyPlanRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    study_type: str = Field(default="Assessment Preparation", max_length=50)
    course_id: Optional[uuid.UUID] = None
    teaching_workspace_id: Optional[uuid.UUID] = None
    assessment_id: Optional[uuid.UUID] = None
    start_date: datetime
    end_date: datetime
    available_days: List[str] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    blackout_dates: List[str] = []
    preferred_time_start: str = "19:00"
    preferred_time_end: str = "21:00"
    session_duration_minutes: int = 60
    daily_goal: str = "Study 1 topic per session"
    preferred_difficulty: str = "Balanced"
    reminder_preference_minutes: int = 30
    reminder_channels: List[str] = ["in_app", "browser"]
    priority: str = "Medium"
    auto_generate_sessions: bool = True

    @model_validator(mode="after")
    def validate_dates_and_blackouts(self) -> Self:
        if self.end_date <= self.start_date:
            raise ValueError("End date must be strictly after start date")
        cleaned_blackouts = []
        for d in self.blackout_dates:
            d_str = str(d).strip()
            if not d_str:
                continue
            try:
                datetime.strptime(d_str, "%Y-%m-%d")
                cleaned_blackouts.append(d_str)
            except ValueError:
                raise ValueError(f"Invalid blackout date format '{d}'. Expected YYYY-MM-DD.")
        self.blackout_dates = cleaned_blackouts
        return self


class GeneratePlanFromAssessmentRequest(BaseModel):
    assessment_id: uuid.UUID
    available_days: List[str] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    blackout_dates: List[str] = []
    preferred_time_start: str = "19:00"
    preferred_time_end: str = "21:00"
    session_duration_minutes: int = 60
    daily_goal: str = "Master 1 assessment topic per session"
    preferred_difficulty: str = "Balanced"
    reminder_preference_minutes: int = 30
    reminder_channels: List[str] = ["in_app", "browser"]
    priority: str = "High"

    @model_validator(mode="after")
    def validate_blackouts(self) -> Self:
        cleaned_blackouts = []
        for d in self.blackout_dates:
            d_str = str(d).strip()
            if not d_str:
                continue
            try:
                datetime.strptime(d_str, "%Y-%m-%d")
                cleaned_blackouts.append(d_str)
            except ValueError:
                raise ValueError(f"Invalid blackout date format '{d}'. Expected YYYY-MM-DD.")
        self.blackout_dates = cleaned_blackouts
        return self


class CompleteSessionRequest(BaseModel):
    understanding_level: str = Field(description="YES, PARTIAL, NO")
    difficulty_rating: Optional[str] = "Medium"
    confidence_rating: Optional[int] = 4
    feedback_notes: Optional[str] = None
    checklist_items: Optional[List[Dict[str, Any]]] = None


class GenerateQuizRequest(BaseModel):
    question_count: int = Field(default=5, ge=1, le=10)


class RescheduleSessionRequest(BaseModel):
    new_start: datetime
    new_duration_minutes: Annotated[
        Optional[int],
        Field(
            default=None,
            ge=1,
            validation_alias=AliasChoices("new_duration_minutes", "new_duration"),
        ),
    ] = None
    force: bool = False

    @property
    def new_duration(self) -> Optional[int]:
        return self.new_duration_minutes


class AdjustPlanRequest(BaseModel):
    action: str = Field(description="reduce_duration | shift_weekends | rebalance_topics")


class ReadinessTimelinePoint(BaseModel):
    label: str
    score: int


class MaterialCoverageItem(BaseModel):
    course_code: str
    course_title: str
    covered_count: int
    total_count: int
    coverage_percentage: float


class ScheduleConflictWarning(BaseModel):
    session_a_id: str
    session_a_title: str
    session_b_id: str
    session_b_title: str
    overlap_time: str


class StudyPlannerDashboardSummary(BaseModel):
    active_plan: Optional[StudyPlanResponse] = None
    total_plans: int = 0
    completed_sessions_count: int = 0
    total_sessions_count: int = 0
    streak_days: int = 0
    hours_studied_this_week: float = 0.0
    weekly_study_activity: List[bool] = Field(default_factory=lambda: [False]*7)
    today_session: Optional[StudySessionResponse] = None
    next_upcoming_session: Optional[StudySessionResponse] = None
    assessment_readiness_score: int = DEFAULT_INITIAL_READINESS_SCORE
    weak_topics: List[str] = []
    proactive_suggestion: Optional[Dict[str, Any]] = None
    unplanned_assessments: List[Dict[str, Any]] = []
    readiness_timeline: List[ReadinessTimelinePoint] = []
    material_coverage: List[MaterialCoverageItem] = []
    schedule_conflicts: List[ScheduleConflictWarning] = []


StudySessionResponse.model_rebuild()
StudyPlanResponse.model_rebuild()
CreateStudyPlanRequest.model_rebuild()
GeneratePlanFromAssessmentRequest.model_rebuild()
CompleteSessionRequest.model_rebuild()
GenerateQuizRequest.model_rebuild()
RescheduleSessionRequest.model_rebuild()
AdjustPlanRequest.model_rebuild()
ReadinessTimelinePoint.model_rebuild()
MaterialCoverageItem.model_rebuild()
ScheduleConflictWarning.model_rebuild()
StudyPlannerDashboardSummary.model_rebuild()
