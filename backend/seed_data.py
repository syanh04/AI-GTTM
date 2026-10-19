import os
import random
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database import Detection, Base
import uuid

# Setup DB connection
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "alpr.db")
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

def seed_data():
    session = SessionLocal()
    
    # Configuration
    CAMERAS = ["CAM_01", "CAM_02", "CAM_03", "CAM_04", "CAM_05", "CAM_06"]
    VEHICLE_TYPES = ["car", "motorcycle", "truck", "bus"]
    VIOLATION_TYPES = ["Vượt đèn đỏ", "Lấn làn đường", "Chạy quá tốc độ", "Đi ngược chiều", "Không đội mũ bảo hiểm"]
    PROVINCES = ["29", "30", "31", "15", "51", "43", "75"]
    
    print("Starting data seeding for past 24 hours...")
    
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(hours=24)
    
    total_records = 0
    batch = []
    
    current_time = start_time
    while current_time < end_time:
        # Traffic intensity (Peak hours logic)
        hour = current_time.hour
        if 7 <= hour <= 9 or 17 <= hour <= 19:
            intensity = random.randint(5, 15) # Heavy traffic
        elif 23 <= hour <= 5:
            intensity = random.randint(0, 3)  # Low traffic
        else:
            intensity = random.randint(2, 8)  # Normal traffic
        
        for _ in range(intensity):
            # Generate random record
            v_type = random.choices(VEHICLE_TYPES, weights=[0.4, 0.45, 0.1, 0.05])[0]
            camera = random.choice(CAMERAS)
            
            # Random plate
            plate = f"{random.choice(PROVINCES)}{chr(random.randint(65, 90))}{random.randint(1,9)}-{random.randint(100,999)}.{random.randint(10,99)}"
            
            # Violation Logic (15% chance)
            is_violation = random.random() < 0.15
            violation_type = random.choice(VIOLATION_TYPES) if is_violation else None
            
            # Random execution time jitter within the minute
            record_time = current_time + timedelta(seconds=random.randint(0, 59))
            
            detection = Detection(
                plate_number=plate,
                vehicle_type=v_type,
                confidence=round(random.uniform(0.7, 0.99), 2),
                timestamp=record_time,
                image_path="placeholder_seed.jpg",
                crop_path=None,
                camera_id=camera,
                violation_type=violation_type
            )
            batch.append(detection)
            total_records += 1
            
        current_time += timedelta(minutes=random.randint(3, 10)) # Advance time
        
        if len(batch) >= 100:
            session.add_all(batch)
            session.commit()
            batch = []
            print(f"Seeded {total_records} records...")

    if batch:
        session.add_all(batch)
        session.commit()
    
    print(f"✅ Seeding Complete. Total Records: {total_records}")
    session.close()

if __name__ == "__main__":
    seed_data()
