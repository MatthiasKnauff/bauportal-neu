"""KI-Ausgang: die EINE Stelle, an der das Bauportal mit einer KI spricht – im Büro (Ollama) oder außerhalb
(Claude, ChatGPT, Gemini).

Hilfsdienst – nur aus dem Bauportal erreichbar, kein Port nach außen, merkt sich nichts: Zugangsschlüssel und Text
kommen mit jeder Anfrage und werden nicht aufbewahrt oder protokolliert. Was nach außen geht, hat das Bauportal
vorher von Namen befreit (Anonymisierung); dieser Dienst reicht nur durch.
"""
import os

import httpx
from fastapi import FastAPI, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel

SCHLUESSEL = os.environ.get("DIENST_SCHLUESSEL", "")
ADRESSEN = {"claude": "https://api.anthropic.com", "openai": "https://api.openai.com", "gemini": "https://generativelanguage.googleapis.com"}
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
transport: httpx.AsyncBaseTransport | None = None   # in den Tests ein nachgestellter Anbieter


class Anbindung(BaseModel):
    art: str                 # ollama | claude | openai | gemini
    adresse: str = ""        # nur Ollama: wo es im Büro läuft, z. B. http://192.168.1.20:11434
    schluessel: str = ""     # Zugangsschlüssel des Anbieters (nicht bei Ollama)
    modell: str = ""


class Frage(Anbindung):
    anweisung: str           # was die KI tun soll
    text: str                # womit
    hoechstens: int = 2000   # Länge der Antwort in Token


class Anbieterfehler(Exception):
    pass


def basis(a: Anbindung) -> str:
    if a.art == "ollama":
        if not a.adresse.startswith(("http://", "https://")):
            raise Anbieterfehler("Die Adresse der KI im Büro fehlt (z. B. http://192.168.1.20:11434)")
        return a.adresse.rstrip("/")
    if a.art not in ADRESSEN:
        raise Anbieterfehler(f"Unbekannte Art der Anbindung: {a.art}")
    if not a.schluessel:
        raise Anbieterfehler("Für diese Anbindung ist noch kein Zugangsschlüssel hinterlegt")
    return ADRESSEN[a.art]


def kopf(a: Anbindung) -> dict:
    if a.art == "claude":
        return {"x-api-key": a.schluessel, "anthropic-version": "2023-06-01"}
    if a.art == "openai":
        return {"authorization": f"Bearer {a.schluessel}"}
    if a.art == "gemini":
        return {"x-goog-api-key": a.schluessel}
    return {}


async def ruf(a: Anbindung, methode: str, pfad: str, body: dict | None = None, zeit: float = 120) -> dict:
    try:
        async with httpx.AsyncClient(timeout=zeit, transport=transport) as c:
            r = await c.request(methode, basis(a) + pfad, headers=kopf(a), json=body)
    except httpx.TimeoutException:
        raise Anbieterfehler("Die KI hat nicht rechtzeitig geantwortet") from None
    except httpx.HTTPError:
        raise Anbieterfehler("Die KI ist nicht erreichbar" + (" – läuft Ollama, und stimmt die Adresse?" if a.art == "ollama" else "")) from None
    if r.status_code in (401, 403):
        raise Anbieterfehler("Der Anbieter lehnt den Zugangsschlüssel ab")
    if r.status_code == 404 and body is not None:
        raise Anbieterfehler(f"Das Modell „{a.modell}“ kennt der Anbieter nicht")
    if r.status_code == 429:
        raise Anbieterfehler("Der Anbieter meldet: zu viele Anfragen oder Guthaben aufgebraucht")
    if r.status_code >= 400:
        try:
            d = r.json()
            f = d.get("error", d)
            grund = f.get("message", "") if isinstance(f, dict) else str(f)
        except ValueError:
            grund = ""
        raise Anbieterfehler(f"Der Anbieter meldet Fehler {r.status_code}" + (f": {grund[:300]}" if grund else ""))
    return r.json()


async def fragen(f: Frage) -> dict:
    if not f.modell:
        raise Anbieterfehler("Für diese Anbindung ist noch kein Modell gewählt")
    if f.art == "ollama":
        d = await ruf(f, "POST", "/api/chat", {"model": f.modell, "stream": False, "options": {"num_predict": f.hoechstens},
                                              "messages": [{"role": "system", "content": f.anweisung}, {"role": "user", "content": f.text}]}, zeit=300)
        return {"text": d.get("message", {}).get("content", ""), "ein": d.get("prompt_eval_count", 0), "aus": d.get("eval_count", 0)}
    if f.art == "claude":
        d = await ruf(f, "POST", "/v1/messages", {"model": f.modell, "max_tokens": f.hoechstens, "system": f.anweisung, "messages": [{"role": "user", "content": f.text}]})
        return {"text": "".join(t.get("text", "") for t in d.get("content", []) if t.get("type") == "text"),
                "ein": d.get("usage", {}).get("input_tokens", 0), "aus": d.get("usage", {}).get("output_tokens", 0)}
    if f.art == "openai":
        d = await ruf(f, "POST", "/v1/chat/completions", {"model": f.modell, "messages": [{"role": "system", "content": f.anweisung}, {"role": "user", "content": f.text}]})
        return {"text": (d.get("choices") or [{}])[0].get("message", {}).get("content") or "",
                "ein": d.get("usage", {}).get("prompt_tokens", 0), "aus": d.get("usage", {}).get("completion_tokens", 0)}
    d = await ruf(f, "POST", f"/v1beta/models/{f.modell.removeprefix('models/')}:generateContent",
                  {"system_instruction": {"parts": [{"text": f.anweisung}]}, "contents": [{"role": "user", "parts": [{"text": f.text}]}]})
    teile = ((d.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
    return {"text": "".join(t.get("text", "") for t in teile if not t.get("thought")),
            "ein": d.get("usageMetadata", {}).get("promptTokenCount", 0), "aus": d.get("usageMetadata", {}).get("candidatesTokenCount", 0)}


async def modelle(a: Anbindung) -> list[str]:
    """Was der Anbieter gerade anbietet – so muss niemand Modellnamen auswendig wissen, und die Liste veraltet nicht."""
    if a.art == "ollama":
        return sorted(m["name"] for m in (await ruf(a, "GET", "/api/tags", zeit=15)).get("models", []))
    if a.art == "gemini":
        d = await ruf(a, "GET", "/v1beta/models?pageSize=1000", zeit=30)
        return sorted(m["name"].removeprefix("models/") for m in d.get("models", []) if "generateContent" in m.get("supportedGenerationMethods", []))
    d = await ruf(a, "GET", "/v1/models?limit=1000" if a.art == "claude" else "/v1/models", zeit=30)
    return sorted(m["id"] for m in d.get("data", []))


def gepruef(x_schluessel: str | None):
    return None if SCHLUESSEL and x_schluessel == SCHLUESSEL else JSONResponse({"fehler": "Kein Zugriff"}, status_code=403)


@app.get("/health")
def health():
    return {"status": "ok", "version": os.environ.get("APP_VERSION", "dev")}


@app.post("/frage")
async def route_frage(f: Frage, x_schluessel: str | None = Header(default=None)):
    if (nein := gepruef(x_schluessel)) is not None:
        return nein
    try:
        antwort = await fragen(f)
    except Anbieterfehler as e:
        return JSONResponse({"fehler": str(e)}, status_code=502)
    if not antwort["text"].strip():
        return JSONResponse({"fehler": "Die KI hat nichts geantwortet"}, status_code=502)
    return antwort


@app.post("/modelle")
async def route_modelle(a: Anbindung, x_schluessel: str | None = Header(default=None)):
    if (nein := gepruef(x_schluessel)) is not None:
        return nein
    try:
        return {"modelle": await modelle(a)}
    except Anbieterfehler as e:
        return JSONResponse({"fehler": str(e)}, status_code=502)
