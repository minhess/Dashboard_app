import json

import pytest


@pytest.fixture
def client():
    from src.web.app import app

    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_get_data(client):
    res = client.get("/api/data")
    assert res.status_code == 200
    data = res.get_json()
    assert isinstance(data, list)
    assert len(data) > 0


def test_get_items_and_post(client):
    # get existing items
    res = client.get("/api/items")
    assert res.status_code == 200
    items = res.get_json()
    assert isinstance(items, list)

    # post new item
    payload = {"name": "TestItem", "value": 12.3}
    res = client.post(
        "/api/items", data=json.dumps(payload), content_type="application/json"
    )
    assert res.status_code == 201
    new_item = res.get_json()
    assert new_item["name"] == "TestItem"

    # ensure item appears in list
    res = client.get("/api/items")
    items = res.get_json()
    assert any(i["name"] == "TestItem" for i in items)
