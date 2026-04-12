FROM python:3.11-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy backend directory
COPY backend/ backend/

# Install dependencies using uv
RUN cd backend && uv sync --frozen

# Ensure 'backend' is importable as a package from /app
ENV PYTHONPATH=/app

EXPOSE 8000

# Start FastAPI server
CMD ["uv", "run", "--directory", "backend", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
