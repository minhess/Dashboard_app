from flask import Flask
from flask_socketio import SocketIO

from src.config import config

socketio = SocketIO(cors_allowed_origins="*")


def create_app(config_key):
    # Create Flask instance
    app = Flask(__name__)

    # Setup app config by form_object. Read config class for each env
    app.config.from_object(config[config_key])

    from src.dashboard import views as dashboard_views

    app.register_blueprint(dashboard_views.dsb, url_prefix="/dashboard")

    socketio.init_app(app)

    return app
