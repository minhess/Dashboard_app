from flask import (
    Blueprint,
    render_template,
    jsonify,
    request,
    url_for,
    send_from_directory,
)
import pandas as pd
import numpy as np
from src.app import socketio

pi_est = Blueprint(
    "pi_estimate",
    __name__,
    static_folder="static",
    template_folder="templates",
)

# Background metric emitter control
thread = None
thread_stop_event = False
thread_paused = False
thread_token = None


@pi_est.route("/show")
def show():
    return render_template("pi_estimate/show.html")


def _pi_background_thread(token):
    """Background thread that emits random points and pi estimate."""
    import random

    global thread_stop_event, thread_paused, thread, thread_token

    inside = 0
    total = 0

    while True:
        # if asked to stop completely, exit loop
        if thread_stop_event:
            break

        # if paused, sleep here but keep the thread alive so state is preserved
        while thread_paused and not thread_stop_event:
            socketio.sleep(1)
        # generate random point in unit square [0,1] x [0,1]
        x = random.random()
        y = random.random()
        total += 1
        # test against circle centered in the middle of the unit square
        dx = x - 0.5
        dy = y - 0.5
        if dx * dx + dy * dy <= 0.25:
            inside += 1

        # fraction_inside = area_circle / area_square = (pi * r^2) / 1
        # with r = 0.5 => fraction = pi/4, so pi estimate = 4 * inside/total
        pi_estimate = 4.0 * inside / float(total)

        data = {
            "x": x,
            "y": y,
            "inside": bool(dx * dx + dy * dy <= 0.25),
            "pi": pi_estimate,
            "total": total,
        }

        try:
            # emit to namespace /pi
            socketio.emit("point", data, namespace="/pi")
        except Exception:
            pass

        # throttle emission rate
        socketio.sleep(2)
    # thread is exiting: only clear global thread reference if this is the
    # same thread that was recorded when it started (avoid clobbering a
    # newly-started thread in restart()).
    try:
        if thread_token is token:
            thread = None
            thread_token = None
    except Exception:
        pass


@pi_est.route("/pause")
def pause():
    """Pause background emitter without terminating the thread.

    This preserves the thread's internal `inside`/`total` state so that
    continuing will resume the previous estimator rather than starting a
    fresh one.
    """
    global thread_paused
    thread_paused = True
    return jsonify({"status": "paused"})


@pi_est.route("/continue")
def resume():
    """Resume background emitter: start a new background task if needed."""
    global thread, thread_stop_event, thread_paused, thread_token
    # clear any stop flag; if thread exists, unpause it; otherwise start it
    thread_stop_event = False
    thread_paused = False
    if thread is None:
        # create a per-thread token so exit can safely clear only this thread
        token = object()
        thread_token = token
        thread = socketio.start_background_task(_pi_background_thread, token)
        return jsonify({"status": "started"})
    return jsonify({"status": "resumed"})


@pi_est.route("/restart")
def restart():
    """Restart the background emitter, resetting internal counts.

    This signals the existing thread to stop and then starts a fresh
    background task with counters reset to zero.
    """
    global thread, thread_stop_event, thread_paused, thread_token
    # request the current thread to stop and unpause (so it can exit)
    thread_stop_event = True
    thread_paused = False

    # wait (with timeout) for the existing thread to clear its global
    # reference. This avoids a race where the old thread clears our new
    # thread reference after we start it.
    import time

    wait_until = time.time() + 2.0
    while thread is not None and time.time() < wait_until:
        time.sleep(0.01)

    # now start a fresh thread with a new token
    token = object()
    thread_token = token
    thread_stop_event = False
    thread = socketio.start_background_task(_pi_background_thread, token)
    return jsonify({"status": "restarted"})


@socketio.on("connect", namespace="/pi")
def pi_connect():
    """Start background thread when first client connects to /pi."""
    global thread, thread_stop_event, thread_token

    if thread is None:
        thread_stop_event = False
        thread = socketio.start_background_task(_pi_background_thread, thread_token)


@socketio.on("disconnect", namespace="/pi")
def pi_disconnect():
    # keep running; client can reconnect. Do not stop thread immediately.
    pass
