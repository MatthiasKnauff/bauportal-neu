"""Druckdienst: macht aus einer fertigen Seite (HTML) ein PDF – mit demselben Browserkern, der auch die Vorschau zeigt.

Hilfsdienst – nur aus dem Bauportal erreichbar, kein Port nach außen, merkt sich nichts.
Die Seite bringt alles mit; der Browser darf beim Drucken nichts aus dem Netz laden.
"""
import asyncio
import os
import shutil
import tempfile

from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse, Response

SCHLUESSEL = os.environ.get("DIENST_SCHLUESSEL", "")
GRENZE = 20 * 1024 * 1024
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
gleichzeitig = asyncio.Semaphore(2)   # ein Browser je Ausdruck; mehr als zwei zugleich lohnt auf kleinen Servern nicht


def browser() -> str:
    for name in (os.environ.get("CHROMIUM", ""), "chromium", "chromium-browser", "google-chrome", "chrome"):
        pfad = name if name and os.path.isfile(name) else shutil.which(name) if name else None
        if pfad:
            return pfad
    raise RuntimeError("Kein Chromium gefunden")


async def drucken(html: bytes) -> bytes:
    with tempfile.TemporaryDirectory() as ordner:
        seite, pdf = os.path.join(ordner, "seite.html"), os.path.join(ordner, "seite.pdf")
        with open(seite, "wb") as f:
            f.write(html)
        async with gleichzeitig:
            lauf = await asyncio.create_subprocess_exec(
                browser(), "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--no-first-run",
                "--disable-extensions", "--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND",   # kein Netz
                f"--user-data-dir={os.path.join(ordner, 'profil')}", "--no-pdf-header-footer", f"--print-to-pdf={pdf}", "file://" + seite,
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
            try:
                _, fehler = await asyncio.wait_for(lauf.communicate(), 60)
            except asyncio.TimeoutError:
                lauf.kill()
                raise RuntimeError("Das Drucken hat zu lange gedauert") from None
        if not os.path.isfile(pdf):
            raise RuntimeError("Der Browser hat kein PDF erzeugt: " + fehler.decode(errors="replace")[-300:])
        with open(pdf, "rb") as f:
            return f.read()


@app.get("/health")
def health():
    return {"status": "ok", "version": os.environ.get("APP_VERSION", "dev")}


@app.post("/pdf")
async def route_pdf(req: Request, x_schluessel: str | None = Header(default=None)):
    if not SCHLUESSEL or x_schluessel != SCHLUESSEL:
        return JSONResponse({"fehler": "Kein Zugriff"}, status_code=403)
    html = await req.body()
    if not html or len(html) > GRENZE:
        return JSONResponse({"fehler": "Die Seite fehlt oder ist zu groß"}, status_code=400)
    try:
        return Response(await drucken(html), media_type="application/pdf")
    except RuntimeError as e:
        return JSONResponse({"fehler": str(e)}, status_code=500)
