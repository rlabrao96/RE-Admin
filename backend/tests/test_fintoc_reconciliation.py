"""
Tests for Fintoc reconciliation logic.
Mocks the Fintoc API and Supabase client to verify sync + auto-match behavior.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.fintoc_service import sync_movements, _normalize_rut, _try_auto_match_inflow


# ── RUT normalization ─────────────────────────────────────────────────────────

def test_normalize_rut_strips_formatting():
    assert _normalize_rut("12.345.678-9") == "123456789"
    assert _normalize_rut("12345678-K") == "12345678k"
    assert _normalize_rut("") == ""
    assert _normalize_rut(None) == ""


# ── Sync movements ────────────────────────────────────────────────────────────

def _mock_supabase():
    """Create a mock supabase client with chainable table().select().eq()... pattern."""
    mock = MagicMock()

    def make_chain(data=None):
        chain = MagicMock()
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.in_.return_value = chain
        chain.not_.return_value = chain
        chain.order.return_value = chain
        chain.maybe_single.return_value = chain
        chain.insert.return_value = chain
        chain.update.return_value = chain
        chain.upsert.return_value = chain
        execute_result = MagicMock()
        execute_result.data = data if data is not None else []
        chain.execute.return_value = execute_result
        return chain

    # Default: return empty
    mock.table.return_value = make_chain([])
    return mock, make_chain


@pytest.mark.asyncio
async def test_sync_no_config():
    """If no bank config exists, sync returns early."""
    mock_sb, make_chain = _mock_supabase()
    # bank_account_config returns None
    mock_sb.table.return_value = make_chain(None)

    result = await sync_movements(mock_sb, "building-123")
    assert result["synced_count"] == 0
    assert "No Fintoc account linked" in result["message"]


@pytest.mark.asyncio
async def test_sync_no_link_token():
    """If config exists but no link token, sync returns early."""
    mock_sb, make_chain = _mock_supabase()
    config_chain = make_chain({"fintoc_link_token": None, "fintoc_account_id": None, "last_sync_at": None})
    mock_sb.table.return_value = config_chain

    result = await sync_movements(mock_sb, "building-123")
    assert result["synced_count"] == 0


@pytest.mark.asyncio
async def test_sync_fetches_and_inserts_movements():
    """Verify that new movements are inserted and counts are correct."""
    mock_sb, make_chain = _mock_supabase()

    fake_movements = [
        {
            "id": "mov_001",
            "amount": 150000,
            "currency": "CLP",
            "description": "Pago gasto comun",
            "post_date": "2026-03-01",
            "transaction_date": "2026-03-01",
            "sender_account": {"holder_id": "12.345.678-9", "holder_name": "Juan Perez"},
            "reference_id": "ref123",
        },
        {
            "id": "mov_002",
            "amount": -50000,
            "currency": "CLP",
            "description": "Pago luz",
            "post_date": "2026-03-01",
            "transaction_date": "2026-03-01",
            "recipient_account": {"holder_id": "98.765.432-1", "holder_name": "Empresa Electrica"},
            "reference_id": "ref456",
        },
    ]

    call_count = {"n": 0}
    original_table = mock_sb.table

    def table_side_effect(name):
        call_count["n"] += 1
        if name == "bank_account_config":
            return make_chain({
                "fintoc_link_token": "link_test",
                "fintoc_account_id": "acc_test",
                "last_sync_at": None,
            })
        if name == "fintoc_movements":
            # First call = select existing, second = insert
            if call_count["n"] <= 3:
                return make_chain([])  # no existing
            return make_chain([])  # insert result
        if name == "residents":
            return make_chain([])  # no residents → no auto-match
        return make_chain([])

    mock_sb.table.side_effect = table_side_effect

    with patch("app.services.fintoc_service.get_account_movements", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = fake_movements
        result = await sync_movements(mock_sb, "building-123")

    assert result["synced_count"] == 2
    assert result["auto_matched_count"] == 0
    mock_fetch.assert_called_once_with("link_test", "acc_test", None)


# ── Auto-match inflow ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_auto_match_inflow_by_rut():
    """When a movement's holder RUT matches a resident's RUT, and charge amount matches, it should auto-match."""
    mock_sb, make_chain = _mock_supabase()

    call_map = {}

    def table_side_effect(name):
        if name == "residents":
            return make_chain([{"id": "res-1", "unit_id": "unit-1", "rut": "12345678-9"}])
        if name == "units":
            return make_chain([{"id": "unit-1", "floor_id": "floor-1"}])
        if name == "floors":
            return make_chain([{"id": "floor-1"}])
        if name == "charges":
            return make_chain([{"id": "charge-1", "amount_clp": 150000}])
        if name == "fintoc_movements":
            return make_chain([])
        return make_chain([])

    mock_sb.table.side_effect = table_side_effect

    movement = {
        "fintoc_id": "mov_001",
        "type": "inflow",
        "amount": 150000,
        "holder_id": "12.345.678-9",
    }

    result = await _try_auto_match_inflow(mock_sb, "building-123", movement)
    assert result is True


@pytest.mark.asyncio
async def test_auto_match_no_rut_match():
    """When holder RUT doesn't match any resident, should not match."""
    mock_sb, make_chain = _mock_supabase()

    def table_side_effect(name):
        if name == "residents":
            return make_chain([{"id": "res-1", "unit_id": "unit-1", "rut": "99999999-9"}])
        return make_chain([])

    mock_sb.table.side_effect = table_side_effect

    movement = {
        "fintoc_id": "mov_001",
        "type": "inflow",
        "amount": 150000,
        "holder_id": "12.345.678-9",
    }

    result = await _try_auto_match_inflow(mock_sb, "building-123", movement)
    assert result is False
