import os
from datetime import datetime
from typing import Generator, Optional, List, Dict, Any
import pytz

_VN_TZ = pytz.timezone('Asia/Ho_Chi_Minh')

def _vn_now():
    """Returns current time in Asia/Ho_Chi_Minh timezone."""
    return datetime.now(_VN_TZ)

from sqlalchemy import Boolean, Column, DateTime, Float, Index, Integer, String, Text, create_engine, event, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.getenv("ALPR_DB_PATH") or os.path.join(BASE_DIR, "alpr.db")
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "").strip() or f"sqlite:///{DB_PATH}"
_IS_SQLITE = SQLALCHEMY_DATABASE_URL.startswith("sqlite:")
if os.getenv("APP_ENV", "development").strip().lower() in {"production", "prod"} and _IS_SQLITE:
    raise RuntimeError("DATABASE_URL must point to PostgreSQL when APP_ENV=production")

if _IS_SQLITE:
    if ":memory:" in SQLALCHEMY_DATABASE_URL:
        engine = create_engine(
            SQLALCHEMY_DATABASE_URL,
            connect_args={"check_same_thread": False},
        )
    else:
        engine = create_engine(
            SQLALCHEMY_DATABASE_URL,
            connect_args={"check_same_thread": False, "timeout": 30},
            pool_size=max(16, int(os.getenv("SQLITE_POOL_SIZE", "32"))),
            max_overflow=max(16, int(os.getenv("SQLITE_POOL_OVERFLOW", "32"))),
            pool_timeout=max(5, int(os.getenv("SQLITE_POOL_TIMEOUT", "15"))),
            pool_recycle=300,
            pool_pre_ping=True,
        )
else:
    engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)


@event.listens_for(engine, "connect")
def _configure_sqlite_connection(dbapi_connection, _connection_record) -> None:
    if not _IS_SQLITE:
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class Detection(Base):
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True, index=True)
    plate_number = Column(String, index=True, nullable=False, default="Unknown")
    ocr_score = Column(Float, nullable=False, default=0.0)
    vote_count = Column(Integer, nullable=False, default=0)
    vehicle_type = Column(String, index=True, nullable=False, default="Unknown")
    confidence = Column(Float, nullable=False, default=0.0)
    timestamp = Column(DateTime, default=_vn_now, index=True)
    last_seen_at = Column(DateTime, default=_vn_now, index=True)
    image_path = Column(String, nullable=False)
    crop_path = Column(String, nullable=True)
    camera_id = Column(String, nullable=True)
    track_id = Column(Integer, nullable=True)
    violation_type = Column(String, nullable=True)
    review_status = Column(String, nullable=True, default="pending")
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    review_note = Column(Text, nullable=True)
    is_simulated = Column(Integer, default=0) # 0=False, 1=True
    is_temporary = Column(Integer, default=0) # 0=False, 1=True
    plate_crop_source = Column(String, nullable=True)
    plate_debug_reason = Column(String, nullable=True)
    plate_debug_variant = Column(String, nullable=True)
    deleted_at = Column(DateTime, nullable=True, index=True)
    deleted_by = Column(String, nullable=True)
    delete_reason = Column(Text, nullable=True)
    plate_number_original = Column(String, nullable=True)
    plate_edited_by = Column(String, nullable=True)
    plate_edited_at = Column(DateTime, nullable=True)
    plate_norm = Column(String, nullable=True, index=True)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="user")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_vn_now)
    # ← ĐÃ THÊM: User model


class Camera(Base):
    __tablename__ = "cameras"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    location_name = Column(String, nullable=True)
    district = Column(String, nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    source_type = Column(String, nullable=False, default="file")
    source_uri = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    enabled = Column(Integer, nullable=False, default=1)
    is_simulated = Column(Integer, nullable=False, default=0)
    archived = Column(Integer, nullable=False, default=0)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=_vn_now)
    updated_at = Column(DateTime, default=_vn_now, onupdate=_vn_now)


class ViolationRuleMap(Base):
    __tablename__ = "violation_rule_map"

    id = Column(Integer, primary_key=True, index=True)
    violation_type = Column(String, unique=True, nullable=False, index=True)
    rule_id = Column(String, nullable=False, index=True)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=_vn_now)


def rule_for_violation(db: Session, violation_type: Optional[str]) -> Optional[str]:
    """Look up rule_id for a given violation type, returns None if not mapped."""
    if not violation_type:
        return None
    v = violation_type.strip()
    mapping = db.query(ViolationRuleMap).filter(
        (ViolationRuleMap.violation_type == v) | 
        (ViolationRuleMap.violation_type == v.lower())
    ).first()
    return mapping.rule_id if mapping else None



class NotificationHistory(Base):
    __tablename__ = "notification_history"

    id = Column(Integer, primary_key=True, index=True)
    violation_id = Column(String, nullable=False, index=True)
    detection_id = Column(Integer, nullable=True, index=True)
    license_plate = Column(String, nullable=True, index=True)
    channel = Column(String, nullable=False, index=True)
    status = Column(String, nullable=False, index=True)
    recipient = Column(String, nullable=True)
    message = Column(Text, nullable=True)
    operator = Column(String, nullable=True)
    sent_at = Column(DateTime, default=_vn_now, index=True)

    __table_args__ = (
        Index("idx_notification_violation_time", "violation_id", "sent_at"),
        Index("idx_notification_plate_time", "license_plate", "sent_at"),
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    ts = Column(DateTime, default=_vn_now, nullable=False, index=True)
    user_id = Column(Integer, nullable=True)
    username = Column(String, nullable=False, index=True)
    role = Column(String, nullable=True)
    action = Column(String, nullable=False, index=True)
    entity_type = Column(String, nullable=True)
    entity_id = Column(String, nullable=True)
    before_json = Column(Text, nullable=True)
    after_json = Column(Text, nullable=True)
    note = Column(Text, nullable=True)
    ip = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)

    __table_args__ = (
        Index("idx_audit_ts_action", "ts", "action"),
        Index("idx_audit_username_ts", "username", "ts"),
    )


class LaneConfig(Base):
    __tablename__ = "lane_config"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(String, nullable=False, index=True)
    lane_id = Column(String, nullable=False, index=True)
    lane_name = Column(String, nullable=True)
    polygon_json = Column(Text, nullable=False)
    direction_vector_json = Column(Text, nullable=False)
    direction_start_json = Column(Text, nullable=True)
    direction_end_json = Column(Text, nullable=True)
    frame_width = Column(Integer, nullable=True)
    frame_height = Column(Integer, nullable=True)
    homography_json = Column(Text, nullable=True)
    meter_per_pixel = Column(Float, nullable=True)
    is_active = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, default=_vn_now)
    updated_at = Column(DateTime, default=_vn_now)

    __table_args__ = (
        Index("idx_lane_config_camera_lane", "camera_id", "lane_id"),
    )


class VehicleTrajectory(Base):
    __tablename__ = "vehicle_trajectory"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, nullable=False, default=_vn_now, index=True)
    camera_id = Column(String, nullable=False, index=True)
    track_id = Column(Integer, nullable=False, index=True)
    raw_track_id = Column(Integer, nullable=True)
    class_name = Column(String, nullable=True, index=True)
    bbox_json = Column(Text, nullable=False)
    center_bottom_x = Column(Float, nullable=False)
    center_bottom_y = Column(Float, nullable=False)
    lane_id = Column(String, nullable=True, index=True)
    speed_px_s = Column(Float, nullable=True)
    speed_m_s = Column(Float, nullable=True)
    confidence = Column(Float, nullable=True)

    __table_args__ = (
        Index("idx_trajectory_camera_time", "camera_id", "timestamp"),
        Index("idx_trajectory_camera_track_time", "camera_id", "track_id", "timestamp"),
        Index("idx_trajectory_lane_time", "lane_id", "timestamp"),
    )


class LaneTrafficStats(Base):
    __tablename__ = "lane_traffic_stats"

    id = Column(Integer, primary_key=True, index=True)
    bucket_start = Column(DateTime, nullable=False, index=True)
    bucket_seconds = Column(Integer, nullable=False, default=60)
    camera_id = Column(String, nullable=False, index=True)
    lane_id = Column(String, nullable=True, index=True)
    class_name = Column(String, nullable=True, index=True)
    total_vehicles = Column(Integer, nullable=False, default=0)
    vehicles_per_minute = Column(Float, nullable=False, default=0.0)
    density = Column(Float, nullable=False, default=0.0)
    avg_speed_px_s = Column(Float, nullable=True)
    avg_speed_m_s = Column(Float, nullable=True)

    __table_args__ = (
        Index("idx_lane_stats_camera_bucket", "camera_id", "bucket_start"),
        Index("idx_lane_stats_lane_bucket", "lane_id", "bucket_start"),
    )


class TrafficEvent(Base):
    __tablename__ = "traffic_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String, nullable=False, index=True)
    camera_id = Column(String, nullable=False, index=True)
    vehicle_id = Column(Integer, nullable=False, index=True)
    affected_vehicle_id = Column(Integer, nullable=True)
    from_lane = Column(String, nullable=True)
    to_lane = Column(String, nullable=True)
    risk_level = Column(String, nullable=True, index=True)
    risk_score = Column(Float, nullable=True)
    pixel_ttc_estimate = Column(Float, nullable=True)
    ttc_seconds = Column(Float, nullable=True)
    gap_px = Column(Float, nullable=True)
    gap_m = Column(Float, nullable=True)
    timestamp = Column(DateTime, nullable=False, default=_vn_now, index=True)
    snapshot_path = Column(String, nullable=True)
    metadata_json = Column(Text, nullable=True)

    __table_args__ = (
        Index("idx_events_camera_time", "camera_id", "timestamp"),
        Index("idx_events_camera_type_time", "camera_id", "event_type", "timestamp"),
    )


def init_db() -> None:
    """Create database tables if they do not exist."""
    Base.metadata.create_all(bind=engine)
    _ensure_detection_columns()
    _ensure_analytics_indexes()


def _ensure_detection_columns() -> None:
    """Best-effort SQLite migration for newly added detection fields."""
    inspector = inspect(engine)
    if "detections" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("detections")}
    column_defs = {
        "ocr_score": "FLOAT DEFAULT 0.0",
        "vote_count": "INTEGER DEFAULT 0",
        "last_seen_at": "DATETIME",
        "track_id": "INTEGER",
        "is_temporary": "INTEGER DEFAULT 0",
        "plate_crop_source": "TEXT",
        "plate_debug_reason": "TEXT",
        "plate_debug_variant": "TEXT",
        "review_status": "TEXT DEFAULT 'pending'",
        "reviewed_by": "TEXT",
        "reviewed_at": "DATETIME",
        "resolved_at": "DATETIME",
        "review_note": "TEXT",
        "deleted_at": "DATETIME",
        "deleted_by": "TEXT",
        "delete_reason": "TEXT",
        "plate_number_original": "TEXT",
        "plate_edited_by": "TEXT",
        "plate_edited_at": "DATETIME",
        "plate_norm": "TEXT",
    }

    with engine.begin() as conn:
        for column_name, column_sql in column_defs.items():
            if column_name in existing_columns:
                continue
            conn.execute(text(f"ALTER TABLE detections ADD COLUMN {column_name} {column_sql}"))

    # Backfill plate_norm if any rows have NULL plate_norm
    try:
        from .services.plates import normalize_plate
    except ImportError:
        try:
            from services.plates import normalize_plate
        except ImportError:
            normalize_plate = None

    if normalize_plate is not None:
        with SessionLocal() as db:
            rows = db.query(Detection).filter(Detection.plate_norm.is_(None)).all()
            if rows:
                for row in rows:
                    row.plate_norm = normalize_plate(row.plate_number)
                db.commit()


def _ensure_analytics_indexes() -> None:
    """Best-effort indexes for lane analytics tables on existing SQLite DBs."""
    index_sql = [
        "CREATE INDEX IF NOT EXISTS idx_lane_config_camera_lane ON lane_config (camera_id, lane_id)",
        "CREATE INDEX IF NOT EXISTS idx_trajectory_camera_time ON vehicle_trajectory (camera_id, timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_trajectory_camera_track_time ON vehicle_trajectory (camera_id, track_id, timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_trajectory_lane_time ON vehicle_trajectory (lane_id, timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_lane_stats_camera_bucket ON lane_traffic_stats (camera_id, bucket_start)",
        "CREATE INDEX IF NOT EXISTS idx_lane_stats_lane_bucket ON lane_traffic_stats (lane_id, bucket_start)",
        "CREATE INDEX IF NOT EXISTS idx_events_camera_time ON traffic_events (camera_id, timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_events_camera_type_time ON traffic_events (camera_id, event_type, timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_detections_deleted_at ON detections (deleted_at)",
        "CREATE INDEX IF NOT EXISTS idx_detections_plate_norm ON detections (plate_norm)",
        "CREATE INDEX IF NOT EXISTS idx_detections_cam_time ON detections (camera_id, timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_detections_review_status ON detections (review_status)",
        "CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs (ts)",
        "CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs (action)",
        "CREATE INDEX IF NOT EXISTS idx_audit_username ON audit_logs (username)",
    ]

    with engine.begin() as conn:
        for statement in index_sql:
            conn.execute(text(statement))


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that provides a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
