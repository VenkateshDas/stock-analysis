from datetime import datetime, timedelta, timezone

import jwt
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

client = TestClient(app)

# Sign with the same secret the app uses (reads from .env / env vars)
_TEST_TOKEN = jwt.encode(
    {"sub": "testuser", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
    settings.jwt_secret,
    algorithm="HS256",
)
_AUTH = {"Authorization": f"Bearer {_TEST_TOKEN}"}


def test_register_and_list_strategy():
    payload = {
        'config': {
            'strategy_id': 'IN_BREAKOUT_V1',
            'name': 'India Intraday Breakout',
            'version': 'v1',
            'description': 'Test registration',
            'instrument': 'NIFTY',
            'parameters': {'target_rr': 2},
            'enabled': True,
            'algo_id': 'ALG-IN-BREAKOUT-V1',
            'created_at': '2026-02-23T10:00:00',
        }
    }

    res = client.post('/api/v1/bot/strategies/register', json=payload, headers=_AUTH)
    assert res.status_code == 200
    assert res.json()['status'] == 'ok'

    listed = client.get('/api/v1/bot/strategies', headers=_AUTH)
    assert listed.status_code == 200
    ids = [x['strategy_id'] for x in listed.json()]
    assert 'IN_BREAKOUT_V1' in ids


def test_risk_status_and_signals_endpoints():
    risk = client.get('/api/v1/bot/risk/status', headers=_AUTH)
    assert risk.status_code == 200
    assert risk.json()['max_trades_per_day'] == 3

    signals = client.get('/api/v1/bot/signals', headers=_AUTH)
    assert signals.status_code == 200
    assert isinstance(signals.json(), list)


def test_unauthenticated_bot_returns_401():
    res = client.get('/api/v1/bot/status')
    assert res.status_code == 401


def test_public_indices_no_auth_required():
    res = client.get('/api/v1/indices')
    # 200 or 503 (if Yahoo is down in CI) — but NOT 401
    assert res.status_code != 401


def test_signup_and_login():
    import uuid
    new_user = f"testuser_{uuid.uuid4().hex[:6]}"

    # Signup
    res = client.post('/api/v1/auth/signup', json={'username': new_user, 'password': 'testpass123'})
    assert res.status_code == 201
    token = res.json()['access_token']
    assert token

    # Login with same credentials
    res2 = client.post('/api/v1/auth/login', json={'username': new_user, 'password': 'testpass123'})
    assert res2.status_code == 200

    # Me endpoint
    res3 = client.get('/api/v1/auth/me', headers={'Authorization': f'Bearer {token}'})
    assert res3.status_code == 200
    assert res3.json()['username'] == new_user.lower()


def test_signup_duplicate_rejected():
    import uuid
    new_user = f"dup_{uuid.uuid4().hex[:6]}"
    client.post('/api/v1/auth/signup', json={'username': new_user, 'password': 'testpass123'})
    res = client.post('/api/v1/auth/signup', json={'username': new_user, 'password': 'testpass123'})
    assert res.status_code == 409


def test_signup_short_password_rejected():
    res = client.post('/api/v1/auth/signup', json={'username': 'testguy', 'password': 'short'})
    assert res.status_code == 422
