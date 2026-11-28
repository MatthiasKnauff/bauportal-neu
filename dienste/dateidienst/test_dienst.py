"""Test des Dateidienstes gegen einen kleinen SMB-Server im selben Prozess (impacket)."""
import io
import os
import tempfile
import threading
import time

os.environ["DIENST_SCHLUESSEL"] = "test"
from fastapi.testclient import TestClient  # noqa: E402
from impacket import ntlm  # noqa: E402
from impacket.smbserver import SimpleSMBServer  # noqa: E402

import dienst  # noqa: E402

PORT = int(os.environ.get("SMB_TESTPORT", "4455"))


def starte_server(ordner: str) -> None:
    s = SimpleSMBServer(listenAddress="127.0.0.1", listenPort=PORT)
    s.addShare("PROJEKTE", ordner, "")
    s.setSMB2Support(True)
    s.addCredential("bauportal", 0, ntlm.compute_lmhash("geheim"), ntlm.compute_nthash("geheim"))
    threading.Thread(target=s.start, daemon=True).start()
    time.sleep(1)


def text_pdf(zeilen: list[str]) -> bytes:
    """Kleine PDF mit Textebene (Helvetica), eine Zeile je Eintrag."""
    inhalt = "BT /F1 11 Tf 60 780 Td 14 TL " + " ".join(f"({z}) Tj T*" for z in zeilen) + " ET"
    teile = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
             "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
             f"<< /Length {len(inhalt)} >>\nstream\n{inhalt}\nendstream", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    aus, stellen = "%PDF-1.4\n", []
    for i, t in enumerate(teile, 1):
        stellen.append(len(aus)); aus += f"{i} 0 obj\n{t}\nendobj\n"
    x = len(aus)
    aus += f"xref\n0 {len(teile) + 1}\n0000000000 65535 f \n" + "".join(f"{s:010d} 00000 n \n" for s in stellen)
    return (aus + f"trailer\n<< /Size {len(teile) + 1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n").encode("latin-1")


def docx(absaetze: list[str]) -> bytes:
    import zipfile
    roh = io.BytesIO()
    with zipfile.ZipFile(roh, "w") as z:
        z.writestr("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
                   + "".join(f"<w:p><w:r><w:t>{a}</w:t></w:r></w:p>" for a in absaetze) + "</w:body></w:document>")
    return roh.getvalue()


def main() -> None:
    with tempfile.TemporaryDirectory() as ordner:
        os.makedirs(f"{ordner}/2026-01 Haus A/Pläne")
        open(f"{ordner}/2026-01 Haus A/Pläne/Grundriss EG.pdf", "wb").write(b"%PDF-1.4 " + b"x" * 3_000_000)
        open(f"{ordner}/2026-01 Haus A/Notiz.txt", "w").write("Hallo")
        open(f"{ordner}/2026-01 Haus A/~$gesperrt.docx", "w").write("x")
        starte_server(ordner)
        c = TestClient(dienst.app)
        k = {"X-Schluessel": "test"}
        z = {"freigabe": f"//127.0.0.1:{PORT}/projekte", "benutzer": "bauportal", "kennwort": "geheim"}

        assert c.post("/liste", json={"zugang": z}).status_code == 403, "ohne Schlüssel kein Zugriff"
        r = c.post("/liste", json={"zugang": z, "pfad": ""}, headers=k)
        assert r.status_code == 200, r.text
        assert [(e["name"], e["ordner"]) for e in r.json()["eintraege"]] == [("2026-01 Haus A", True)]
        r = c.post("/liste", json={"zugang": z, "pfad": "2026-01 Haus A"}, headers=k).json()["eintraege"]
        assert [e["name"] for e in r] == ["Pläne", "Notiz.txt"], r   # Ordner zuerst, Sperrdateien ausgeblendet
        assert r[1]["groesse"] == 5 and r[1]["geaendert"].endswith("+00:00")
        r = c.post("/alle", json={"zugang": z, "pfad": "2026-01 Haus A"}, headers=k).json()
        assert sorted(d["pfad"] for d in r["dateien"]) == ["Notiz.txt", "Pläne/Grundriss EG.pdf"] and not r["abgeschnitten"], r   # mit Unterordnern
        r = c.post("/datei", json={"zugang": z, "pfad": "2026-01 Haus A/Pläne/Grundriss EG.pdf"}, headers=k)
        assert r.status_code == 200 and len(r.content) == 3_000_009 and r.content.startswith(b"%PDF")
        r = c.post("/liste", json={"zugang": z, "pfad": "gibt/es/nicht"}, headers=k)
        assert r.status_code == 404, (r.status_code, r.text)
        assert c.post("/liste", json={"zugang": z, "pfad": "../.."}, headers=k).status_code == 400
        assert c.post("/liste", json={"zugang": {**z, "freigabe": "unsinn"}}, headers=k).status_code == 400
        r = c.post("/liste", json={"zugang": {**z, "kennwort": "falsch"}}, headers=k)
        assert r.status_code == 401, (r.status_code, r.text)
        assert c.post("/liste", json={"zugang": z}, headers=k).status_code == 200, "danach geht es mit richtigem Kennwort wieder"
        r = c.post("/liste", json={"zugang": {**z, "freigabe": "//127.0.0.1:1/projekte"}}, headers=k)
        assert r.status_code == 502, (r.status_code, r.text)
        # Ablegen: Ordner entstehen, nichts wird überschrieben
        import base64
        bild = base64.b64encode(b"\xff\xd8\xff" + b"y" * 200_000).decode()
        ziel = {"zugang": z, "pfad": "2026-01 Haus A/Bautagebuch/Fotos/2026-11-24 Bericht 7", "name": "Sohle.jpg", "inhalt": bild}
        assert c.post("/schreiben", json=ziel).status_code == 403
        r = c.post("/schreiben", json=ziel, headers=k)
        assert r.status_code == 200 and r.json() == {"name": "Sohle.jpg", "groesse": 200_003}, r.text
        assert c.post("/schreiben", json=ziel, headers=k).json()["name"] == "Sohle (2).jpg", "gleicher Name: die neue Datei bekommt eine Nummer"
        assert c.post("/schreiben", json={**ziel, "name": "ohne Endung"}, headers=k).json()["name"] == "ohne Endung"
        assert sorted(os.listdir(f"{ordner}/2026-01 Haus A/Bautagebuch/Fotos/2026-11-24 Bericht 7")) == ["Sohle (2).jpg", "Sohle.jpg", "ohne Endung"]
        assert os.path.getsize(f"{ordner}/2026-01 Haus A/Bautagebuch/Fotos/2026-11-24 Bericht 7/Sohle.jpg") == 200_003
        assert c.post("/schreiben", json={**ziel, "name": "../x.jpg"}, headers=k).status_code == 400
        assert c.post("/schreiben", json={**ziel, "pfad": "../raus"}, headers=k).status_code == 400
        assert c.post("/schreiben", json={**ziel, "inhalt": "kein base64 !"}, headers=k).status_code == 400
        # Ersetzen (geprüfte Fassung): die alte wandert in den Papierkorb, die neue trägt den Namen; ohne alte einfach ablegen
        neu_inhalt = base64.b64encode(b"neu").decode()
        r = c.post("/schreiben", json={**ziel, "inhalt": neu_inhalt, "papierkorb": "2026-01 Haus A/_Papierkorb"}, headers=k)
        assert r.json()["name"] == "Sohle.jpg", r.text
        assert open(f"{ordner}/2026-01 Haus A/Bautagebuch/Fotos/2026-11-24 Bericht 7/Sohle.jpg", "rb").read() == b"neu"
        assert os.listdir(f"{ordner}/2026-01 Haus A/_Papierkorb") == ["Sohle.jpg"]
        assert c.post("/schreiben", json={**ziel, "name": "GEPRÜFT.pdf", "papierkorb": "2026-01 Haus A/_Papierkorb"}, headers=k).json()["name"] == "GEPRÜFT.pdf"
        assert c.post("/schreiben", json={**ziel, "papierkorb": "../raus"}, headers=k).status_code == 400
        # Vorschaubilder: ein echtes Bild und ein echtes PDF (erste Seite), kaputtes PDF, fremde Art
        import io
        from PIL import Image
        Image.new("RGB", (1600, 1200), (200, 30, 30)).save(f"{ordner}/2026-01 Haus A/Foto.jpg", "JPEG")
        import pypdfium2 as pdfium
        neu = pdfium.PdfDocument.new()
        neu.new_page(595, 842)
        neu.save(f"{ordner}/2026-01 Haus A/Plan.pdf")
        v = {"zugang": z, "breite": 200}
        r = c.post("/vorschau", json={**v, "pfad": "2026-01 Haus A/Foto.jpg"}, headers=k)
        assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg", r.text
        assert Image.open(io.BytesIO(r.content)).size == (200, 150)
        r = c.post("/vorschau", json={**v, "pfad": "2026-01 Haus A/Plan.pdf"}, headers=k)
        assert r.status_code == 200 and Image.open(io.BytesIO(r.content)).size[0] == 200, r.text
        assert c.post("/vorschau", json={**v, "pfad": "2026-01 Haus A/Pläne/Grundriss EG.pdf"}, headers=k).status_code == 422, "kaputtes PDF"
        assert c.post("/vorschau", json={**v, "pfad": "2026-01 Haus A/Notiz.txt"}, headers=k).status_code == 415
        assert c.post("/vorschau", json={**v, "pfad": "2026-01 Haus A/Foto.jpg"}).status_code == 403
        # Lesen: PDF mit Textebene direkt, Scan (Bild ohne Text) über die Texterkennung
        import base64
        from PIL import ImageDraw, ImageFont
        scan = Image.new("RGB", (1700, 600), "white")
        schrift = ImageFont.load_default(size=56)
        ImageDraw.Draw(scan).text((80, 120), "Abschlagsrechnung Nr. 4711", fill="black", font=schrift)
        ImageDraw.Draw(scan).text((80, 300), "Malerbetrieb Kunz GmbH", fill="black", font=schrift)
        roh = io.BytesIO(); scan.save(roh, "PDF", resolution=150)
        r = c.post("/lesen", json={"name": "scan.pdf", "inhalt": base64.b64encode(roh.getvalue()).decode()}, headers=k)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["ocr"] and "4711" in j["seiten"][0] and "Kunz" in j["seiten"][0], j["seiten"]
        assert Image.open(io.BytesIO(base64.b64decode(j["vorschau"]))).size[0] == 600
        leer = open(f"{ordner}/2026-01 Haus A/Plan.pdf", "rb").read()
        assert c.post("/lesen", json={"name": "a.txt", "inhalt": base64.b64encode(b"x").decode()}, headers=k).status_code == 415
        assert c.post("/lesen", json={"name": "a.pdf", "inhalt": base64.b64encode(b"%PDF kaputt").decode()}, headers=k).status_code == 422
        assert c.post("/lesen", json={"name": "a.pdf", "inhalt": base64.b64encode(leer).decode()}).status_code == 403
        # Wörter mit Stelle: PDF mit Textebene (Spalten bleiben getrennt), Scan über die Texterkennung, Word ohne Bild
        r = c.post("/woerter", json={"name": "lv.pdf", "inhalt": base64.b64encode(text_pdf(["01.0010   Wand streichen   120,00 m2", "Dispersion weiss"])).decode()}, headers=k)
        assert r.status_code == 200, r.text
        j = r.json(); w = j["seiten"][0]["woerter"]
        assert not j["ocr"] and [x[4] for x in w][:4] == ["01.0010", "Wand", "streichen", "120,00"], w
        assert 0 < w[0][0] < w[1][0] < 1 and 0 < w[0][1] < w[-1][1] < 1 and j["seiten"][0]["bild"], "Rahmen in Anteilen, oben zuerst"
        r = c.post("/woerter", json={"name": "scan.pdf", "inhalt": base64.b64encode(roh.getvalue()).decode()}, headers=k)
        assert r.status_code == 200 and r.json()["ocr"] and any("4711" in x[4] for x in r.json()["seiten"][0]["woerter"]), r.text
        r = c.post("/woerter", json={"name": "lv.docx", "inhalt": base64.b64encode(docx(["01 Erdarbeiten", "01.0010 Aushub 25 m3"])).decode()}, headers=k)
        assert r.status_code == 200 and [x[4] for x in r.json()["seiten"][0]["woerter"]][:3] == ["01", "Erdarbeiten", "01.0010"] and r.json()["seiten"][0]["bild"] is None, r.text
        assert c.post("/woerter", json={"name": "a.doc", "inhalt": base64.b64encode(b"x").decode()}, headers=k).status_code == 415
        # Verschieben: in einen (neuen) Unterordner, ohne zu überschreiben
        open(f"{ordner}/Eingang.pdf", "wb").write(b"%PDF eins")
        r = c.post("/verschieben", json={"zugang": z, "pfad": "Eingang.pdf", "nach": "Scans/verarbeitet"}, headers=k)
        assert r.status_code == 200 and r.json()["name"] == "Eingang.pdf", r.text
        open(f"{ordner}/Eingang.pdf", "wb").write(b"%PDF zwei")
        assert c.post("/verschieben", json={"zugang": z, "pfad": "Eingang.pdf", "nach": "Scans/verarbeitet"}, headers=k).json()["name"] == "Eingang (2).pdf"
        assert open(f"{ordner}/Scans/verarbeitet/Eingang.pdf", "rb").read() == b"%PDF eins"
        assert c.post("/verschieben", json={"zugang": z, "pfad": "../x.pdf", "nach": "a"}, headers=k).status_code == 400
        print("Dateidienst: alle Prüfungen bestanden")


if __name__ == "__main__":
    try:
        main()
    except BaseException:  # noqa: BLE001 – der Testserver läuft in eigenen Threads, deshalb hart beenden
        import traceback
        traceback.print_exc()
        os._exit(1)
    os._exit(0)
