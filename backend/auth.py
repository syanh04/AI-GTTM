import hashlib
import hmac
import os
import secrets
import time
from datetime import datetime, timedelta
import jwt
from passlib.context import CryptContext
from fastapi import Cookie, Depends, Header, HTTPException, Query
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
try:
    from .database import SessionLocal, User, get_db
except ImportError:
    from database import SessionLocal, User, get_db

_IS_PRODUCTION = os.getenv("APP_ENV", "development").strip().lower() in {"production", "prod"}
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "").strip()
if not SECRET_KEY:
    if _IS_PRODUCTION:
        raise RuntimeError("JWT_SECRET_KEY is required when APP_ENV=production")
    SECRET_KEY = "change-me-local-dev-secret-at-least-32-bytes"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)


def hash_password(password: str):
    return pwd_context.hash(password)


def create_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def authenticate_token(active_token: str, db: Session) -> User | None:
    try:
        payload = jwt.decode(active_token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            return None
    except jwt.InvalidTokenError:
        return None
    user = db.query(User).filter(User.username == username).first()
    return user if user and user.is_active else None


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    auth_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db, scope="function")
):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Token không hợp lệ",
        headers={"WWW-Authenticate": "Bearer"})
    active_token = token or auth_token
    if not active_token:
        raise credentials_exception
    user = authenticate_token(active_token, db)
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Tài khoản bị khóa")
    return user


def require_admin(
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Chỉ admin mới có quyền này")
    return current_user


def require_any_role(
    current_user: User = Depends(get_current_user)
):
    if not current_user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Tài khoản bị khóa")
    return current_user


def _chatbot_internal_key() -> str:
    """Return the shared bot/backend key without exposing the Telegram token.

    A dedicated key is preferred in production. For the existing local demo
    setup, both processes can safely derive the same key from the bot token so
    no administrator password needs to be stored in the chatbot.
    """
    configured_key = os.getenv("CHATBOT_INTERNAL_API_KEY", "").strip()
    if configured_key:
        return configured_key
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    if not bot_token:
        return ""
    return hashlib.sha256(f"smart-traffic-chatbot:{bot_token}".encode("utf-8")).hexdigest()


def require_chatbot_or_user(
    x_chatbot_key: str | None = Header(default=None, alias="X-Chatbot-Key"),
    token: str | None = Depends(oauth2_scheme),
    auth_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db, scope="function"),
):
    """Allow the Telegram service key or a normal authenticated application user."""
    expected_key = _chatbot_internal_key()
    supplied_key = (x_chatbot_key or "").strip()
    if expected_key and supplied_key and secrets.compare_digest(supplied_key, expected_key):
        return None
    return get_current_user(token=token, auth_token=auth_token, db=db)


def chatbot_notice_signature(detection_id: int, expires: int) -> str:
    key = _chatbot_internal_key()
    if not key:
        return ""
    message = f"{int(detection_id)}:{int(expires)}".encode("utf-8")
    return hmac.new(key.encode("utf-8"), message, hashlib.sha256).hexdigest()


def require_signed_chatbot_notice(
    detection_id: int,
    expires: int = Query(..., gt=0),
    sig: str = Query(..., min_length=32, max_length=128),
) -> None:
    """Validate a short-lived Telegram link without exposing an authenticated session."""
    now = int(time.time())
    if expires < now or expires > now + (8 * 24 * 60 * 60):
        raise HTTPException(status_code=403, detail="Liên kết biên bản đã hết hạn hoặc không hợp lệ")
    expected = chatbot_notice_signature(detection_id, expires)
    if not expected or not secrets.compare_digest(sig, expected):
        raise HTTPException(status_code=403, detail="Chữ ký liên kết biên bản không hợp lệ")


def require_operator(
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in {"admin", "operator"}:
        raise HTTPException(status_code=403, detail="Operator or admin role required")
    return current_user
# ← ĐÃ TẠO: auth.py
