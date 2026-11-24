# IFC-Dienst: liest eine IFC-Datei und liefert Gebäude, Geschosse, Räume und Bauteile als Liste.
# Hilfsdienst in Python – nur aus dem Bauportal erreichbar, kein Port nach außen, merkt sich nichts.
FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY dienst.py .
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION PYTHONUNBUFFERED=1 TMPDIR=/tmp
EXPOSE 8000
USER nobody
CMD ["uvicorn", "dienst:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
