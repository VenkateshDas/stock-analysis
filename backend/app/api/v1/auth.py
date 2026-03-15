from __future__ import annotations

import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from pydantic import BaseModel

from app.config import settings

router = APIRouter(prefix="/auth")

_bearer = HTTPBearer(auto_error=False)
_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
_DB_PATH = Path(__file__).resolve().parents[3] / "data" / "bot" / "bot.db"


@dataclass
class AuthUser:
    id: str
    username: str


# ── DB helpers ────────────────────────────────────────────────────────────────

def _ensure_users_table() -> None:
    """Create the users table if it doesn't exist (idempotent)."""
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH))
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def _db_get_user(username: str) -> Optional[dict]:
    """Return {id, username, hashed_password} from the users table, or None."""
    try:
        _ensure_users_table()
        conn = sqlite3.connect(str(_DB_PATH))
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT id, username, hashed_password FROM users WHERE username=?",
            (username.lower(),),
        ).fetchone()
        conn.close()
        return dict(row) if row else None
    except Exception:
        return None


def _db_username_exists(username: str) -> bool:
    try:
        _ensure_users_table()
        conn = sqlite3.connect(str(_DB_PATH))
        row = conn.execute(
            "SELECT 1 FROM users WHERE username=?", (username.lower(),)
        ).fetchone()
        conn.close()
        return row is not None
    except Exception:
        return False


def _db_create_user(username: str, hashed_password: str) -> str:
    _ensure_users_table()
    user_id = str(uuid.uuid4())
    conn = sqlite3.connect(str(_DB_PATH))
    conn.execute(
        "INSERT INTO users (id, username, hashed_password, created_at) VALUES (?, ?, ?, ?)",
        (user_id, username.lower(), hashed_password, datetime.utcnow().isoformat()),
    )
    conn.commit()
    conn.close()
    return user_id


# ── ENV-var fallback ──────────────────────────────────────────────────────────

def _env_get_hash(username: str) -> Optional[str]:
    """Check AUTH_USERS env var for username → hashed_password."""
    raw = settings.auth_users.strip()
    if not raw:
        return None
    for entry in raw.split(","):
        entry = entry.strip()
        if ":" not in entry:
            continue
        u, h = entry.split(":", 1)
        if u.strip().lower() == username.lower():
            return h.strip()
    return None


# ── JWT ───────────────────────────────────────────────────────────────────────

def _make_token(username: str) -> str:
    payload = {
        "sub": username.lower(),
        "exp": datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expiry_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> AuthUser:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise exc
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=["HS256"],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise exc
    sub: Optional[str] = payload.get("sub")
    if sub is None:
        raise exc
    return AuthUser(id=sub, username=sub)


# ── Endpoints ─────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class SignupRequest(BaseModel):
    username: str
    password: str
    invite_code: str = ""


@router.post("/login")
async def login(req: LoginRequest):
    key = req.username.strip().lower()
    if not key:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Username required")

    # 1. Check DB users first
    db_user = _db_get_user(key)
    if db_user is not None:
        if not _pwd_ctx.verify(req.password, db_user["hashed_password"]):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        return {"access_token": _make_token(key), "token_type": "bearer"}

    # 2. Fall back to AUTH_USERS env var
    env_hash = _env_get_hash(key)
    if env_hash is not None:
        if not _pwd_ctx.verify(req.password, env_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        return {"access_token": _make_token(key), "token_type": "bearer"}

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")


@router.post("/signup", status_code=201)
async def signup(req: SignupRequest):
    username = req.username.strip().lower()

    if not username or len(username) < 3:
        raise HTTPException(status_code=422, detail="Username must be at least 3 characters")
    if len(req.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    # Check invite code if configured
    required_code = settings.signup_invite_code.strip()
    if required_code and req.invite_code.strip() != required_code:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid invite code")

    # Reject if username already taken in DB or env var
    if _db_username_exists(username) or _env_get_hash(username) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")

    hashed = _pwd_ctx.hash(req.password)
    _db_create_user(username, hashed)
    return {"access_token": _make_token(username), "token_type": "bearer"}


@router.get("/me")
async def me(current_user: AuthUser = Depends(get_current_user)):
    return {"username": current_user.username, "id": current_user.id}
