# Druckdienst: macht aus einer fertigen Seite ein PDF (Chromium ohne Fenster).
# Hilfsdienst in Python – nur aus dem Bauportal erreichbar, kein Port nach außen, merkt sich nichts.
FROM python:3.13-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation2 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY dienst.py .
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION PYTHONUNBUFFERED=1 TMPDIR=/tmp HOME=/tmp
EXPOSE 8000
USER nobody
CMD ["uvicorn", "dienst:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
