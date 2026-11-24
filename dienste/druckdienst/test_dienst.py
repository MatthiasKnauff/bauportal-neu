"""Test des Druckdienstes: eine Seite mit drei Blättern Text wird zum PDF, mit Seitenzahlen in der Fußzeile."""
import os
import re

os.environ["DIENST_SCHLUESSEL"] = "test"
from fastapi.testclient import TestClient  # noqa: E402

import dienst  # noqa: E402

SEITE = """<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 18mm; @bottom-right { content: "Seite " counter(page) " von " counter(pages); font: 8pt sans-serif; } }
p { font: 11pt/1.4 sans-serif; }</style></head><body><h1>Tagesbericht Nr. 7</h1>""" + "<p>Größe, Maße, Übergabe – Zeile für Zeile.</p>" * 110 + "</body></html>"

c = TestClient(dienst.app)
assert c.get("/health").json()["status"] == "ok"
assert c.post("/pdf", content=SEITE.encode()).status_code == 403, "ohne Schlüssel kein Zugriff"
assert c.post("/pdf", content=b"", headers={"X-Schluessel": "test"}).status_code == 400
r = c.post("/pdf", content=SEITE.encode(), headers={"X-Schluessel": "test"})
assert r.status_code == 200, r.text
pdf = r.content
assert pdf.startswith(b"%PDF-") and r.headers["content-type"] == "application/pdf"
seiten = len(re.findall(rb"/Type\s*/Page[^s]", pdf))
assert seiten >= 3, f"mehrere Seiten erwartet, es sind {seiten}"
# A4: 595 × 842 Punkte
assert re.search(rb"/MediaBox\s*\[\s*0\s+0\s+59[45](\.\d+)?\s+84[12](\.\d+)?\s*\]", pdf), "A4 erwartet"
print(f"Druckdienst: alle Prüfungen bestanden ({seiten} Seiten, {len(pdf) // 1024} KB)")
