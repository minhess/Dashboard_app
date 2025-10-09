from flask import Flask, render_template, jsonify, request, url_for, send_from_directory
import pandas as pd
import numpy as np
from flask_socketio import SocketIO

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["SECRET_KEY"] = "dev-secret"
socketio = SocketIO(app, cors_allowed_origins="*")

# Simple in-memory store for demo purposes
items = [
    {"id": 1, "name": "Temperature", "value": 23.4},
    {"id": 2, "name": "Humidity", "value": 56.1},
]

# Background metric emitter control
thread = None
thread_stop_event = False


@app.route("/favicon.ico")
def favicon():
    return send_from_directory(app.static_folder, "favicon.ico")


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/dashboard")
def dashboard():
    # generate a small sample dataset using pandas / numpy
    df = pd.DataFrame(
        {
            "metric": ["Sensor A", "Sensor B", "Sensor C", "Sensor D"],
            "value": np.random.randint(10, 100, size=4),
        }
    )
    stats = {
        "count": int(df["value"].count()),
        "mean": float(df["value"].mean()),
        "max": int(df["value"].max()),
        "min": int(df["value"].min()),
    }
    records = df.to_dict(orient="records")
    return render_template("dashboard.html", records=records, stats=stats)


@app.route("/api/data")
def api_data():
    df = pd.DataFrame(
        {
            "metric": ["Sensor A", "Sensor B", "Sensor C", "Sensor D"],
            "value": np.random.randint(10, 100, size=4),
        }
    )
    return jsonify(df.to_dict(orient="records"))


@app.route("/api/items", methods=["GET", "POST"])
def api_items():
    if request.method == "GET":
        return jsonify(items)

    payload = request.get_json(silent=True)
    if not payload or "name" not in payload:
        return jsonify({"error": 'invalid payload, expected JSON with "name"'}), 400

    new_id = max((i["id"] for i in items), default=0) + 1
    new_item = {"id": new_id, "name": payload["name"], "value": payload.get("value")}
    items.append(new_item)
    # notify connected websocket clients about the new item
    try:
        socketio.emit("new_item", new_item)
    except Exception:
        pass
    return jsonify(new_item), 201


def background_metrics():
    """Background task that emits metric arrays periodically."""
    import time

    while not thread_stop_event:
        df = pd.DataFrame(
            {
                "metric": ["Sensor A", "Sensor B", "Sensor C", "Sensor D"],
                "value": np.random.randint(10, 100, size=4),
            }
        )
        records = df.to_dict(orient="records")
        socketio.emit("new_data", records)
        # sleep using socketio to cooperate with the event loop
        socketio.sleep(5)


@socketio.on("connect")
def on_connect():
    global thread
    # start background thread once
    if thread is None:
        thread = socketio.start_background_task(background_metrics)


if __name__ == "__main__":
    # For local development with Socket.IO support use socketio.run
    # eventlet or gevent is recommended for production; eventlet works well locally
    socketio.run(app, debug=True, host="127.0.0.1", port=5000)
