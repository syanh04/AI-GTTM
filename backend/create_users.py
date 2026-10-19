"""Provision initial users from environment variables without hard-coded passwords."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, User, init_db
from auth import hash_password


def provision(db, username: str, password: str, role: str) -> None:
    if not password:
        return
    if len(password) < 12:
        raise RuntimeError(f"Password for {username} must contain at least 12 characters")
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        db.add(User(username=username, hashed_password=hash_password(password), role=role, is_active=True))
        print(f"[OK] Created {username} ({role})")
    else:
        user.hashed_password = hash_password(password)
        user.role = role
        user.is_active = True
        print(f"[OK] Updated {username} ({role})")


def main() -> None:
    admin_password = os.getenv("INITIAL_ADMIN_PASSWORD", "")
    if not admin_password:
        raise RuntimeError("Set INITIAL_ADMIN_PASSWORD before running this script")
    init_db()
    db = SessionLocal()
    try:
        provision(db, os.getenv("INITIAL_ADMIN_USERNAME", "admin"), admin_password, "admin")
        provision(db, "operator", os.getenv("INITIAL_OPERATOR_PASSWORD", ""), "operator")
        provision(db, "viewer", os.getenv("INITIAL_VIEWER_PASSWORD", ""), "viewer")
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
