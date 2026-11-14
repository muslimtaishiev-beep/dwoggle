FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY bekem ./bekem
# Faults, demo plots, NOAA stations, AppEEARS demo results (see .dockerignore for what stays out)
COPY data ./data
COPY scripts ./scripts

EXPOSE 8000
CMD ["sh", "-c", "uvicorn bekem.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
