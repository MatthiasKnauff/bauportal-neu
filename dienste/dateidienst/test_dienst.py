"""Test des Dateidienstes gegen einen kleinen SMB-Server im selben Prozess (impacket)."""
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
        print("Dateidienst: alle Prüfungen bestanden")


if __name__ == "__main__":
    try:
        main()
    except BaseException:  # noqa: BLE001 – der Testserver läuft in eigenen Threads, deshalb hart beenden
        import traceback
        traceback.print_exc()
        os._exit(1)
    os._exit(0)
