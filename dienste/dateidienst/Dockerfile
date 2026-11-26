# Dateidienst: spricht mit dem Dateiserver (SMB 2/3). Hilfsdienst in Python – nur aus dem Bauportal erreichbar, kein Port nach außen.
FROM python:3.13-slim
WORKDIR /app
# Texterkennung für Scans (deutsch) – läuft im Dienst, nichts geht nach außen
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-deu && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY dienst.py .
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION PYTHONUNBUFFERED=1
EXPOSE 8000
USER nobody
CMD ["uvicorn", "dienst:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
