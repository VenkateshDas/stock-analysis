from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


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

    res = client.post('/api/v1/bot/strategies/register', json=payload)
    assert res.status_code == 200
    assert res.json()['status'] == 'ok'

    listed = client.get('/api/v1/bot/strategies')
    assert listed.status_code == 200
    ids = [x['strategy_id'] for x in listed.json()]
    assert 'IN_BREAKOUT_V1' in ids


def test_risk_status_and_signals_endpoints():
    risk = client.get('/api/v1/bot/risk/status')
    assert risk.status_code == 200
    assert risk.json()['max_trades_per_day'] == 3

    signals = client.get('/api/v1/bot/signals')
    assert signals.status_code == 200
    assert isinstance(signals.json(), list)
