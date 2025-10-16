# Use a lightweight Python base image
FROM python:3.12-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    FLASK_APP=src.app

# Set work directory
WORKDIR /app

# Copy project files
COPY . .

# Install dependencies (prefer pyproject.toml if using poetry or similar)
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Expose Flask port
EXPOSE 5000

# Run the Flask app
CMD ["flask", "run"]
