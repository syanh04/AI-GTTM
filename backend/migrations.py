import os
import logging
from sqlalchemy import text
from backend.database import engine

logger = logging.getLogger(__name__)

MIGRATIONS = [
    {
        "id": 1,
        "name": "initial_schema_indexes",
        "sql": [
            "CREATE INDEX IF NOT EXISTS idx_det_active_time ON detections (timestamp DESC, camera_id) WHERE deleted_at IS NULL;",
            "CREATE INDEX IF NOT EXISTS idx_det_violation ON detections (timestamp DESC) WHERE violation_type IS NOT NULL AND violation_type <> '' AND deleted_at IS NULL;",
            "CREATE INDEX IF NOT EXISTS idx_det_review ON detections (review_status, timestamp DESC) WHERE deleted_at IS NULL;",
            "CREATE INDEX IF NOT EXISTS idx_det_plate_norm ON detections (plate_norm);",
            "CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs (ts DESC);",
            "CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs (entity_type, entity_id);",
            "CREATE INDEX IF NOT EXISTS idx_trajectory_camera_track_time ON vehicle_trajectory (camera_id, track_id, timestamp);"
        ]
    },
    {
        "id": 2,
        "name": "audit_logs_trigger",
        "sql": [
            """
            CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_update
            BEFORE UPDATE ON audit_logs
            BEGIN
                SELECT RAISE(ABORT, 'Update not allowed on audit_logs');
            END;
            """,
            """
            CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_delete
            BEFORE DELETE ON audit_logs
            BEGIN
                SELECT RAISE(ABORT, 'Delete not allowed on audit_logs');
            END;
            """
        ]
    },
    {
        "id": 3,
        "name": "create_views",
        "sql": [
            """
            CREATE VIEW IF NOT EXISTS v_daily_stats AS
            SELECT date(timestamp) as day, camera_id, COUNT(*) as count
            FROM detections
            WHERE deleted_at IS NULL AND is_simulated = 0 AND is_temporary = 0
            GROUP BY day, camera_id;
            """,
            """
            CREATE VIEW IF NOT EXISTS v_hourly_traffic AS
            SELECT strftime('%H', timestamp) as hour, camera_id, COUNT(*) as count
            FROM detections
            WHERE deleted_at IS NULL AND is_simulated = 0 AND is_temporary = 0
            GROUP BY hour, camera_id;
            """,
            """
            CREATE VIEW IF NOT EXISTS v_camera_summary AS
            SELECT camera_id, COUNT(*) as total_detections
            FROM detections
            WHERE deleted_at IS NULL AND is_simulated = 0 AND is_temporary = 0
            GROUP BY camera_id;
            """
        ]
    },
    {
        "id": 4,
        "name": "cameras_table_and_seed",
        "sql": [
            """
            CREATE TABLE IF NOT EXISTS cameras (
                id VARCHAR PRIMARY KEY,
                name VARCHAR NOT NULL,
                location_name VARCHAR,
                district VARCHAR,
                lat REAL,
                lng REAL,
                source_type VARCHAR DEFAULT 'file',
                source_uri VARCHAR,
                ip_address VARCHAR,
                enabled INTEGER DEFAULT 1,
                is_simulated INTEGER DEFAULT 0,
                archived INTEGER DEFAULT 0,
                sort_order INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            """,
            "CREATE INDEX IF NOT EXISTS idx_cameras_enabled ON cameras (enabled, archived);",
            """
            INSERT OR IGNORE INTO cameras (id, name, location_name, district, lat, lng, source_type, source_uri, ip_address, enabled, is_simulated, archived, sort_order)
            VALUES
                ('CAM_01', 'Camera 01 - Cầu Giấy', 'Ngã tư Xuân Thủy - Trần Thái Tông', 'Cầu Giấy', 21.0363, 105.7907, 'file', 'backend/videos/cam1.mp4', '192.168.1.101', 1, 0, 0, 1),
                ('CAM_02', 'Camera 02 - Láng Hạ', 'Ngã tư Láng Hạ - Thái Hà', 'Đống Đa', 21.0156, 105.8149, 'file', 'backend/videos/cam2.mp4', '192.168.1.102', 1, 0, 0, 2),
                ('CAM_03', 'Camera 03 - Tây Hồ', 'Ngã tư Võ Chí Công - Xuân La', 'Tây Hồ', 21.0573, 105.8068, 'file', 'backend/videos/cam3.mkv', '192.168.1.103', 1, 0, 0, 3),
                ('CAM_04', 'Camera 04 - Đinh Tiên Hoàng', 'Ngã tư Đinh Tiên Hoàng - Hàng Khay', 'Hoàn Kiếm', 21.0261, 105.8524, 'file', 'backend/videos/cam4.mkv', '192.168.1.104', 1, 0, 0, 4),
                ('CAM_05', 'Camera 05 - Trần Hưng Đạo', 'Ngã tư Trần Hưng Đạo - Quán Sứ', 'Hoàn Kiếm', 21.0227, 105.8450, 'file', 'backend/videos/cam5.mkv', '192.168.1.105', 1, 0, 0, 5),
                ('CAM_06', 'Camera 06 - Xuân Phương', 'Ngã tư Xuân Phương - Trịnh Văn Bô', 'Nam Từ Liêm', 21.0374, 105.7447, 'file', 'backend/videos/cam6.mkv', '192.168.1.106', 1, 0, 0, 6),
                ('CAM_07', 'Camera 07 - Thanh Xuân', 'Ngã tư Nguyễn Trãi - Khuất Duy Tiến', 'Thanh Xuân', 20.9936, 105.8033, 'file', '', '192.168.1.107', 0, 0, 1, 7),
                ('CAM_08', 'Camera 08 - Ba Đình', 'Ngã tư Kim Mã - Liễu Giai', 'Ba Đình', 21.0352, 105.8342, 'file', '', '192.168.1.108', 0, 0, 1, 8),
                ('CAM_09', 'Camera 09 - Hai Bà Trưng', 'Ngã tư Phố Huế - Đại Cồ Việt', 'Hai Bà Trưng', 21.0069, 105.8525, 'file', '', '192.168.1.109', 0, 0, 1, 9);
            """
        ]
    },
    {
        "id": 5,
        "name": "violation_rule_map_table_and_seed",
        "sql": [
            """
            CREATE TABLE IF NOT EXISTS violation_rule_map (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                violation_type VARCHAR UNIQUE NOT NULL,
                rule_id VARCHAR NOT NULL,
                description VARCHAR,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            """,
            "CREATE INDEX IF NOT EXISTS idx_vrule_type ON violation_rule_map (violation_type);",
            "CREATE INDEX IF NOT EXISTS idx_vrule_id ON violation_rule_map (rule_id);",
            """
            INSERT OR IGNORE INTO violation_rule_map (violation_type, rule_id, description)
            VALUES
                ('red_light', 'ND168_D6_K4_D', 'Không chấp hành hiệu lệnh của đèn tín hiệu giao thông (vượt đèn đỏ)'),
                ('Vượt đèn đỏ', 'ND168_D6_K4_D', 'Không chấp hành hiệu lệnh của đèn tín hiệu giao thông (vượt đèn đỏ)'),
                ('speeding', 'ND168_D6_K3_A', 'Điều khiển xe chạy quá tốc độ quy định'),
                ('Chạy quá tốc độ', 'ND168_D6_K3_A', 'Điều khiển xe chạy quá tốc độ quy định'),
                ('wrong_lane', 'ND168_D6_K5_C', 'Đi không đúng phần đường hoặc làn đường quy định'),
                ('Đi sai làn đường', 'ND168_D6_K5_C', 'Đi không đúng phần đường hoặc làn đường quy định'),
                ('Lấn làn đường', 'ND168_D6_K5_C', 'Đi không đúng làn đường quy định'),
                ('retrograde', 'ND168_D6_K5_A', 'Đi ngược chiều của đường một chiều'),
                ('Đi ngược chiều', 'ND168_D6_K5_A', 'Đi ngược chiều của đường một chiều'),
                ('helmet_less', 'ND168_D7_K3_I', 'Không đội mũ bảo hiểm cho người đi mô tô, xe máy'),
                ('Không đội mũ bảo hiểm', 'ND168_D7_K3_I', 'Không đội mũ bảo hiểm cho người đi mô tô, xe máy'),
                ('yellow_light', 'ND168_D6_K4_D', 'Không chấp hành tín hiệu đèn vàng'),
                ('Vượt đèn vàng', 'ND168_D6_K4_D', 'Không chấp hành tín hiệu đèn vàng'),
                ('illegal_parking', 'ND168_D6_K2_E', 'Dừng xe, đỗ xe trái quy định'),
                ('Dừng đỗ trái phép', 'ND168_D6_K2_E', 'Dừng xe, đỗ xe trái quy định');
            """
        ]
    }
]

def run_migrations():
    with engine.connect() as conn:
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name VARCHAR,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """))
        conn.commit()
        
        applied = set(row[0] for row in conn.execute(text("SELECT version FROM schema_migrations")).fetchall())
        
        for m in MIGRATIONS:
            if m["id"] not in applied:
                logger.info(f"Applying migration {m['id']}: {m['name']}")
                print(f"Applying migration {m['id']}: {m['name']}")
                for statement in m["sql"]:
                    conn.execute(text(statement))
                conn.execute(text("INSERT INTO schema_migrations (version, name) VALUES (:version, :name)"), {"version": m["id"], "name": m["name"]})
                conn.commit()

if __name__ == "__main__":
    run_migrations()

