"""Dateidienst des Bauportals.

Liest die Ablage auf dem Dateiserver über SMB und legt neue Dateien dort ab (nie über eine vorhandene). Der Dienst merkt sich nichts: Das Bauportal schickt bei jedem
Aufruf die Zugangsdaten mit (dort liegen sie verschlüsselt) und einen Pfad innerhalb der Freigabe.
Erreichbar ist der Dienst nur im Docker-Netz und nur mit dem gemeinsamen Schlüssel.
"""
import base64
import binascii
import datetime
import io
import os
import re
import threading

import smbclient
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse, Response, StreamingResponse
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


_UNSICHTBAR = ("Thumbs.db", "desktop.ini")


@app.post("/liste")
def liste(a: Anfrage, x_schluessel: str | None = Header(default=None)):
    """Inhalt eines Ordners. kennung = Dateikennung des Dateiservers: bleibt beim Umbenennen und Verschieben gleich."""
    _pruefe(x_schluessel)
    try:
        v, wurzel = _ziel(a.zugang)
        eintraege = []
        for e in smbclient.scandir(_pfad(wurzel, a.pfad), **v):
            if e.name.startswith(("~$", ".")) or e.name in _UNSICHTBAR:
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


@app.post("/alle")
def alle(a: Anfrage, x_schluessel: str | None = Header(default=None)):
    """Alle Dateien unter einem Ordner, mit Unterordnern (Pfad relativ dazu, Größe, Änderung) – höchstens 20 000;
    darüber steht „abgeschnitten“. Eine Ordnerliste je Ordner, keine Anfrage je Datei."""
    _pruefe(x_schluessel)
    try:
        v, wurzel = _ziel(a.zugang)
        dateien, offen, abgeschnitten = [], [""], False
        while offen and not abgeschnitten:
            rel = offen.pop()
            for e in smbclient.scandir(_pfad(wurzel, "/".join(t for t in (a.pfad, rel) if t)), **v):
                if e.name.startswith(("~$", ".")) or e.name in _UNSICHTBAR:
                    continue
                i, pfad = e.smb_info, f"{rel}/{e.name}" if rel else e.name
                if i.file_attributes & 0x10:
                    offen.append(pfad)
                elif len(dateien) >= 20000:
                    abgeschnitten = True
                    break
                else:
                    dateien.append({"pfad": pfad, "groesse": i.end_of_file, "geaendert": i.last_write_time.isoformat(timespec="seconds")})
        return {"dateien": dateien, "abgeschnitten": abgeschnitten}
    except Fehler:
        raise
    except Exception as e:  # noqa: BLE001
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


class Vorschau(Anfrage):
    breite: int = 320


VORSCHAU_GRENZE = 150 * 1024 * 1024   # größere Dateien bekommen kein Vorschaubild
_BILDER = {"jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff"}


def vorschaubild(daten: bytes, endung: str, breite: int) -> bytes:
    """Vorschaubild (JPEG) aus einer Datei: Bilder verkleinert (Ausrichtung nach EXIF), PDF die erste Seite.
    Nur das Vorschaubild geht zurück – das Original bleibt auf dem Dateiserver."""
    from PIL import Image, ImageOps
    Image.MAX_IMAGE_PIXELS = 120_000_000   # größere gelten als Angriff (Dekompressionsbombe) und werden abgelehnt
    breite = max(64, min(1024, breite))
    if endung == "pdf":
        import pypdfium2 as pdfium
        pdf = pdfium.PdfDocument(daten)
        try:
            seite = pdf[0]
            b, _h = seite.get_size()
            bild = seite.render(scale=min(4.0, breite / max(1.0, b))).to_pil()
        finally:
            pdf.close()
    elif endung in _BILDER:
        bild = Image.open(io.BytesIO(daten))
        bild.draft("RGB", (breite, breite * 4))   # JPEG gleich verkleinert dekodieren
        bild = ImageOps.exif_transpose(bild)
    else:
        raise Fehler("Für diese Dateiart gibt es kein Vorschaubild", 415)
    if bild.mode not in ("RGB", "L"):
        grund = Image.new("RGB", bild.size, "white")
        grund.paste(bild.convert("RGBA"), mask=bild.convert("RGBA").getchannel("A"))
        bild = grund
    bild.thumbnail((breite, breite * 4))
    aus = io.BytesIO()
    bild.convert("RGB").save(aus, "JPEG", quality=80, optimize=True)
    return aus.getvalue()


@app.post("/vorschau")
def vorschau(a: Vorschau, x_schluessel: str | None = Header(default=None)):
    """Vorschaubild einer Datei der Ablage (JPEG)."""
    _pruefe(x_schluessel)
    endung = a.pfad.rsplit(".", 1)[-1].lower() if "." in a.pfad else ""
    if endung != "pdf" and endung not in _BILDER:
        raise Fehler("Für diese Dateiart gibt es kein Vorschaubild", 415)
    try:
        v, wurzel = _ziel(a.zugang)
        pfad = _pfad(wurzel, a.pfad)
        if smbclient.stat(pfad, **v).st_size > VORSCHAU_GRENZE:
            raise Fehler("Die Datei ist für ein Vorschaubild zu groß", 413)
        with smbclient.open_file(pfad, mode="rb", share_access="rwd", **v) as f:
            daten = f.read()
    except Fehler:
        raise
    except Exception as e:  # noqa: BLE001
        raise _deute(e) from e
    try:
        bild = vorschaubild(daten, endung, a.breite)
    except Fehler:
        raise
    except Exception as e:  # noqa: BLE001 – kaputte oder verschlüsselte Datei, Dekompressionsbombe
        raise Fehler(f"Vorschaubild nicht möglich ({type(e).__name__})", 422) from e
    return Response(bild, media_type="image/jpeg")


class Lesen(BaseModel):
    """name = Dateiname (für die Art), inhalt = Datei als Base64."""
    name: str
    inhalt: str


LESEN_GRENZE = 40 * 1024 * 1024
OCR_SEITEN = 20


def _ocr(bild) -> str:
    """Texterkennung (Tesseract, deutsch) für ein Bild – im eigenen Prozess, nichts verlässt den Dienst."""
    import subprocess
    aus = io.BytesIO()
    bild.convert("L").save(aus, "PNG")
    r = subprocess.run(["tesseract", "stdin", "stdout", "-l", "deu", "--psm", "3"], input=aus.getvalue(), capture_output=True, timeout=90, check=False)
    if r.returncode != 0:
        raise Fehler("Die Texterkennung ist fehlgeschlagen", 422)
    return r.stdout.decode("utf-8", "replace")


def text_lesen(daten: bytes, endung: str) -> tuple[list[str], bool]:
    """Text je Seite: PDF mit Textebene direkt, Scans (Seite fast ohne Text) und Bilder über die Texterkennung."""
    from PIL import Image, ImageOps
    Image.MAX_IMAGE_PIXELS = 120_000_000
    if endung == "pdf":
        import pypdfium2 as pdfium
        pdf = pdfium.PdfDocument(daten)
        seiten, ocr = [], False
        try:
            for i in range(len(pdf)):
                seite = pdf[i]
                t = seite.get_textpage().get_text_range()
                if len(t.strip()) < 40 and i < OCR_SEITEN:   # Scan: keine Textebene
                    b, _h = seite.get_size()
                    t, ocr = _ocr(seite.render(scale=min(300 / 72, 2500 / max(1.0, b))).to_pil()), True
                seiten.append(t)
        finally:
            pdf.close()
        return seiten, ocr
    if endung in _BILDER:
        bild = ImageOps.exif_transpose(Image.open(io.BytesIO(daten)))
        return [_ocr(bild)], True
    raise Fehler("Lesen geht bei PDF und Bildern (Scan, Foto)", 415)


@app.post("/lesen")
def lesen(a: Lesen, x_schluessel: str | None = Header(default=None)):
    """Text und Vorschaubild einer hochgeladenen Datei (PDF, Scan, Foto) – zum Erkennen, was sie ist. Gespeichert wird hier nichts."""
    _pruefe(x_schluessel)
    try:
        daten = base64.b64decode(a.inhalt, validate=True)
    except (binascii.Error, ValueError):
        raise Fehler("Der Inhalt der Datei ist nicht lesbar") from None
    if len(daten) > LESEN_GRENZE:
        raise Fehler("Die Datei ist größer als 40 MB", 413)
    endung = a.name.rsplit(".", 1)[-1].lower() if "." in a.name else ""
    try:
        seiten, ocr = text_lesen(daten, endung)
        bild = vorschaubild(daten, endung, 600)
    except Fehler:
        raise
    except Exception as e:  # noqa: BLE001 – kaputte oder verschlüsselte Datei
        raise Fehler(f"Die Datei lässt sich nicht lesen ({type(e).__name__})", 422) from e
    return {"seiten": seiten, "ocr": ocr, "vorschau": base64.b64encode(bild).decode()}


class Verschieben(Anfrage):
    """pfad = Datei innerhalb der Freigabe, nach = Ordner innerhalb der Freigabe (entsteht bei Bedarf)."""
    nach: str


@app.post("/verschieben")
def verschieben(a: Verschieben, x_schluessel: str | None = Header(default=None)):
    """Verschiebt eine Datei in einen Ordner (Eingangsordner → „verarbeitet“), höchstens 40 MB. Gibt es den Namen dort schon,
    bekommt die Datei „ (2)“, „ (3)“ … angehängt – überschrieben wird nie."""
    _pruefe(x_schluessel)
    try:
        v, wurzel = _ziel(a.zugang)
        quelle = _pfad(wurzel, a.pfad)
        ziel = _pfad(wurzel, a.nach)
        stufe = wurzel
        for teil in [t for t in re.split(r"[\\/]+", a.nach) if t]:
            stufe = f"{stufe}\\{teil}"
            try:
                smbclient.mkdir(stufe, **v)
            except SMBOSError as e:
                if e.errno != 17 and "NAME_COLLISION" not in str(e):
                    raise
        name = re.split(r"[\\/]+", a.pfad)[-1]
        stamm, punkt, endung = name.rpartition(".")
        if not punkt:
            stamm, endung = name, ""
        # Kopieren und dann löschen statt Umbenennen: geht auf jedem Dateiserver, auch über Freigabe-Grenzen;
        # x = nur anlegen, nie überschreiben
        if smbclient.stat(quelle, **v).st_size > LESEN_GRENZE:
            raise Fehler("Die Datei ist größer als 40 MB", 413)
        with smbclient.open_file(quelle, mode="rb", share_access="r", **v) as f:
            daten = f.read()
        for n in range(1, 1000):
            neu = name if n == 1 else f"{stamm} ({n}){punkt}{endung}"
            try:
                with smbclient.open_file(_pfad(ziel, neu), mode="xb", **v) as f:
                    f.write(daten)
            except SMBOSError as e:
                if e.errno != 17 and "NAME_COLLISION" not in str(e):
                    raise
                continue
            smbclient.remove(quelle, **v)
            return {"name": neu}
        raise Fehler("Für diese Datei ließ sich kein freier Name finden", 409)
    except Fehler:
        raise
    except Exception as e:  # noqa: BLE001
        raise _deute(e) from e


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
