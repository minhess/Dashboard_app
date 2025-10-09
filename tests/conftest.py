import sys
import pathlib

# Ensure the project root (D:/Dashboard_app) is on sys.path so tests can import src.*
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
