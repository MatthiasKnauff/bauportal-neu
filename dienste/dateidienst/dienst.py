"""Dateidienst des Bauportals.

Liest die Ablage auf dem Dateiserver über SMB und legt neue Dateien dort ab (nie über eine vorhandene). Der Dienst merkt sich nichts: Das Bauportal schickt bei jedem
Aufruf die Zugangsdaten mit (dort liegen sie verschlüsselt) und einen Pfad innerhalb der Freigabe.
Erreichbar ist der Dienst nur im Docker-Netz und nur mit dem gemeinsamen Schlüssel.
"""
import base64
import binascii
import datetime
import os
import re
import threading

import smbclient
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from smbprotocol.exceptions import SMBException, SMBOSError

SCHLUESSEL = os.environ.get("DIENST_SCHLUESSEL", "")
app = FastAPI(title="Bauportal Dateidienst", docs_url=None, redoc_url=None)


class Zugang(BaseModel):
    freigabe: str          # \\server\freigabe oder //server/freigabe, auch mit Unterordner
    benutzer: str = ""
    kennwort: str = ""
    domaene: str = ""


class Anfrage(BaseModel):
    zugang: Zugang
    pfad: str = ""


class Ablegen(Anfrage):
    """pfad = Ordner innerhalb der Freigabe, name = Dateiname, inhalt = Datei als Base64."""
    name: str
    inhalt: str


class Fehler(Exception):
    def __init__(self, text: str, status: int = 400):
        self.text, self.status = text, status


@app.exception_handler(Fehler)
async def _fehler(_req, e: Fehler):
    return JSONResponse({"fehler": e.text}, status_code=e.status)


_sperre = threading.Lock()
_angemeldet: dict[tuple[str, int], tuple[str, str]] = {}


def _ziel(z: Zugang) -> tuple[dict, str]:
    """Zerlegt die Freigabe in Verbindung (Server, Port, Anmeldung) und UNC-Wurzel.
    Die Anmeldung geht bei jedem Zugriff mit – so meldet smbclient sich von selbst neu an, wenn der Dateiserver
    die Verbindung getrennt hat (Neustart, Leerlauf). Ohne sie versuchte es das ohne Kennwort und scheiterte."""
    m = re.fullmatch(r"[\\/]{2}([^\\/:]+)(?::(\d+))?[\\/]+(.+?)[\\/]*", z.freigabe.strip())
    if not m:
        raise Fehler(r"Die Freigabe muss so aussehen: \\server\freigabe")
    server, port, rest = m.group(1), int(m.group(2) or 445), re.sub(r"[\\/]+", r"\\", m.group(3))
    name = f"{z.domaene}\\{z.benutzer}" if z.domaene else z.benutzer
    with _sperre:
        if _angemeldet.get((server, port)) not in (None, (name, z.kennwort)):
            # andere Zugangsdaten als zuletzt: die alte Sitzung schließen, sonst bliebe sie mit den alten Daten bestehen
            try:
                smbclient.delete_session(server, port=port)
            except Exception:
                pass
        _angemeldet[(server, port)] = (name, z.kennwort)
    return {"port": port, "username": name or None, "password": z.kennwort or None, "connection_timeout": 10}, f"\\\\{server}\\{rest}"


def _pfad(wurzel: str, pfad: str) -> str:
    teile = [t for t in re.split(r"[\\/]+", pfad) if t]
    if any(t in (".", "..") or re.search(r'[<>:"|?*\x00-\x1f]', t) for t in teile):
        raise Fehler("Ungültiger Pfad")
    return "\\".join([wurzel, *teile])


def _deute(e: Exception) -> Fehler:
    text = str(e)
    if isinstance(e, SMBOSError):
        if e.errno == 2 or "NOT_FOUND" in text or "NO_SUCH_FILE" in text:
            return Fehler("Den Ordner oder die Datei gibt es auf dem Dateiserver nicht", 404)
        if e.errno == 13 or "ACCESS_DENIED" in text:
            return Fehler("Der Dateiserver verweigert den Zugriff auf diesen Ordner", 403)
    if "LOGON_FAILURE" in text or "ACCOUNT" in text or "WRONG_PASSWORD" in text:
        return Fehler("Der Dateiserver hat die Anmeldung abgelehnt – Benutzer oder Kennwort stimmen nicht", 401)
    if "BAD_NETWORK_NAME" in text:
        return Fehler("Diese Freigabe gibt es auf dem Dateiserver nicht", 404)
    if isinstance(e, (OSError, TimeoutError, ValueError)) and not isinstance(e, SMBException):
        return Fehler(f"Der Dateiserver ist nicht erreichbar ({text[:120]})", 502)
    return Fehler(f"Fehler vom Dateiserver: {text[:200]}", 502)


def _pruefe(schluessel: str | None) -> None:
    if not SCHLUESSEL or schluessel != SCHLUESSEL:
        raise HTTPException(status_code=403)


def _zeit(sekunden: float) -> str:
    return datetime.datetime.fromtimestamp(sekunden, datetime.timezone.utc).isoformat(timespec="seconds")


@app.get("/health")
def health():
    return {"status": "ok", "version": os.environ.get("APP_VERSION", "dev")}


@app.post("/liste")
def liste(a: Anfrage, x_schluessel: str | None = Header(default=None)):
    """Inhalt eines Ordners. kennung = Dateikennung des Dateiservers: bleibt beim Umbenennen und Verschieben gleich."""
    _pruefe(x_schluessel)
    try:
        v, wurzel = _ziel(a.zugang)
        eintraege = []
        for e in smbclient.scandir(_pfad(wurzel, a.pfad), **v):
            if e.name.startswith(("~$", ".")) or e.name in ("Thumbs.db", "desktop.ini"):
                continue
            i = e.smb_info   # kommt mit der Ordnerliste – keine weitere Anfrage je Datei
            ordner = bool(i.file_attributes & 0x10)
            eintraege.append({"name": e.name, "ordner": ordner, "groesse": 0 if ordner else i.end_of_file,
                              "geaendert": i.last_write_time.isoformat(timespec="seconds"), "kennung": str(i.file_id or "")})
        eintraege.sort(key=lambda x: (not x["ordner"], x["name"].lower()))
        return {"eintraege": eintraege}
    except Fehler:
        raise
    except Exception as e:  # noqa: BLE001 – jede Störung wird in eine verständliche Meldung übersetzt
        raise _deute(e) from e


@app.post("/datei")
def datei(a: Anfrage, x_schluessel: str | None = Header(default=None)):
    """Inhalt einer Datei, stückweise durchgereicht."""
    _pruefe(x_schluessel)
    try:
        v, wurzel = _ziel(a.zugang)
        pfad = _pfad(wurzel, a.pfad)
        s = smbclient.stat(pfad, **v)
        f = smbclient.open_file(pfad, mode="rb", share_access="rwd", **v)
    except Fehler:
        raise
    except Exception as e:  # noqa: BLE001
        raise _deute(e) from e

    def stuecke():
        try:
            while True:
                teil = f.read(1024 * 1024)
                if not teil:
                    break
                yield teil
        finally:
            f.close()

    return StreamingResponse(stuecke(), media_type="application/octet-stream",
                             headers={"Content-Length": str(s.st_size), "X-Geaendert": _zeit(s.st_mtime)})


@app.post("/schreiben")
def schreiben(a: Ablegen, x_schluessel: str | None = Header(default=None)):
    """Legt eine neue Datei ab. Fehlende Ordner entstehen; eine vorhandene Datei wird nie überschrieben –
    gibt es den Namen schon, bekommt die neue Datei „ (2)“, „ (3)“ … angehängt."""
    _pruefe(x_schluessel)
    try:
        daten = base64.b64decode(a.inhalt, validate=True)
    except (binascii.Error, ValueError):
        raise Fehler("Der Inhalt der Datei ist nicht lesbar") from None
    if "/" in a.name or "\\" in a.name:
        raise Fehler("Ungültiger Dateiname")
    try:
        v, wurzel = _ziel(a.zugang)
        ordner = _pfad(wurzel, a.pfad)
        _pfad(ordner, a.name)   # prüft den Namen
        # Ordner Stufe für Stufe anlegen; was es schon gibt, bleibt
        stufe = wurzel
        for teil in [t for t in re.split(r"[\\/]+", a.pfad) if t]:
            stufe = f"{stufe}\\{teil}"
            try:
                smbclient.mkdir(stufe, **v)
            except SMBOSError as e:
                if e.errno != 17 and "NAME_COLLISION" not in str(e):
                    raise
        stamm, punkt, endung = a.name.rpartition(".")
        if not punkt:
            stamm, endung = a.name, ""
        for n in range(1, 1000):
            name = a.name if n == 1 else f"{stamm} ({n}){punkt}{endung}"
            try:
                with smbclient.open_file(_pfad(ordner, name), mode="xb", **v) as f:   # x = nur anlegen, nie überschreiben
                    f.write(daten)
                return {"name": name, "groesse": len(daten)}
            except SMBOSError as e:
                if e.errno != 17 and "NAME_COLLISION" not in str(e):
                    raise
        raise Fehler("Für diese Datei ließ sich kein freier Name finden", 409)
    except Fehler:
        raise
    except Exception as e:  # noqa: BLE001
        raise _deute(e) from e
