# Ausschreibung & Abrechnung (AVA): Abgleich mit dem bisherigen Bauportal

Stand: 27.11.2026, nachts.

Grundlage ist eine Analyse des Quelltexts, nicht nur ein Blick auf die Oberfläche:
- Bisheriger Quelltext: `plattform/static/ava-*.js` (ca. 1,2 MB, 19 Dateien, rund 500 Funktionen) und `plattform/ava*.py` (123 Endpunkte).
- Angesehen (nur lesen) wurde das alte Portal im Projekt A497.

Zeichen:
- ✓ vorhanden
- ◐ teilweise vorhanden
- ✗ fehlt
- ⊘ bewusst nicht übernommen, mit Grund

## Rahmen der App

| # | Bisher | Neu | Plan |
|---|---|---|---|
| R1 | Navigation links in vier Gruppen. **Ausschreibung**: Leistungsverzeichnis (mit Anzahl), Fenster- & Türliste. **Vergabe**: Versand & Rücklauf, Nachverfolgen, Angebote & Preisspiegel, Angebotsbesprechung. **Prüfung und Abrechnung**: Aufträge, Aufmaßprüfung, Rechnungen. **Kostenübersicht**. | ✓ | Gliederung wie bisher. Die Listen bleiben über Verweise erreichbar, stehen aber nicht mehr im Menü. |
| R2 | Kopf: „‹Bereich›: LV ‹Nr› ‹Name›“, Stand als Auswahl, Feld „vergeben an …“ bzw. „noch nicht vergeben“, Gewerk · Vertrag · Strafe, Knöpfe Projektdaten und Ausschreibungsdaten | ✓ (LV-Auswahl statt Titel – gilt für alle Ansichten; 27.11.: Vertrag und Strafe im Kopf) | Kopf wie bisher. Das LV wird im Baum gewählt. |
| R3 | Ablaufleiste mit 7 Stufen über die ganze Breite, Unterstrich als Fortschritt, Stufe ergibt sich aus dem Inhalt | ✓ | Optik angleichen |
| R4 | Kennzahlen in der Menüleiste: Schätzung, bestes Angebot, Auftrag, Nachträge beauftragt, Leistungsstand, abgerechnet. Je Bereich passend, Reihenfolge ziehbar. | ✓ | Baustein „Kennzahl“ in der Menüleiste |
| R5 | Volltextsuche links oben mit Bereich „dieses LV · Projekt · alle Projekte“. Sie durchsucht Kurz- und Langtext, OZ, Titel, Nachträge, Bieter:innen, Aufmaß, Rechnungen und Türliste. | ◐ (Suche im LV über OZ, Kurz- und Langtext in allen Baum-Ansichten – 27.11.; Projekt/alle Projekte: Suche oben) | Suchfeld links mit den drei Bereichen |
| R6 | Rechte Seite mit Reitern je Bereich: LV (Details, Baudaten, Bauteile, Planung, Baukasten, Fragen & Antworten), Aufträge (Position, Auftrag), Aufmaß/Rechnungen (PDF, Dokument, Abzüge) | ◐ Nur Details | Reiter über den Baustein Detailkarte (kartenReiter) |
| R7 | Datei: Import · Export · Drucken und Löschen je Bereich (immer an derselben Stelle) | ◐ | Gruppe „Datei“ je Bereich |
| R8 | Ablagefeld „Datei ablegen“ mit Zolli | ⊘ | Gestrichen (Entscheidung 26.11.) |
| R9 | Eingangsordner (Scans vom Kopierer) | ◐ Einstellungen vorhanden | Später mit der Rechnungsprüfung |
| R10 | Versionen der AVA (Startversion …) | ⊘ | Entscheidung 36: Die AVA folgt der Abfolge |
| R11 | Rückgängig mit Verlauf (↶ ▾ Anzahl) | ✓ | |
| R12 | Handyansicht (nur lesen): Aufträge (Summen, Balken Leistung/abgerechnet), LVs mit Titelsummen und Positionen (Tippen zeigt den Langtext), Nachträge, Rechnungen | ✓ (27.11.) | Eigene Handyansicht |

## Leistungsverzeichnis

| # | Bisher | Neu | Plan |
|---|---|---|---|
| L1 | Baum: Projekt → LVs als Ordner → Gliederung → Positionen. Das gewählte LV ist offen, die anderen sind zugeklappt (Klick öffnet), das Archiv steht am Ende. | ✓ | Baum wie bisher |
| L2 | Spalten: Bezeichnung (OZ + Text), Menge, EH, Art, KG, EP (Schätzung), GP. Nach der Vergabe: EP Auftrag + EP Schätz. Darunter „Summe netto (ohne Bedarfs-/Wahlpositionen)“. | ✓ | Spalten wie bisher, KG neu an der Position |
| L3 | Symbol je Art: Normal, Bedarf (gestrichelt E), Wahl (A), Pauschal (P), Hinweistext (i), Vorbemerkung, Nachtrag (orange +) | ✓ | Symbole |
| L4 | Zuschlagsposition (Art Z aus GAEB, % auf Positionen) und Vorbemerkung als Positionsart V | ✓ (27.11.: Vorbemerkung V; Zuschlag Z – Satz in % auf gewählte Positionen, rechnet in Schätzung, Preisspiegel, Auftrag, Aufmaß, Rechnung, Druck und GAEB mit) | Art Z und V |
| L5 | Neu: LV (Womit anfangen?), Gliederung, Position, Hinweistext darunter | ✓ | |
| L6 | Nummerieren mit OZ-Maske und Vorschau | ✓ | |
| L7 | Langtext aufklappen; der offene Langtext wandert mit der Auswahl | ✓ (27.11.: ist genau ein Langtext offen, wandert er mit der Auswahl) | Langtext folgt |
| L8 | Fotos zu Positionen (im Langtext, im Druck) | ✗ | Später (Dateiablage) |
| L9 | Kopierquelle „Baudaten“ rechts: Kataloge (Gliederung, ★ häufig) oder ein LV aus einem anderen Projekt. Mehrere Zeilen wählen, ins LV ziehen oder einfügen. Bei Titel oder Bauteil die Teile einzeln ankreuzen. Korb. | ✗ | Reiter „Baudaten“ mit LVs anderer Projekte; Kataloge, sobald der Positionskatalog kommt |
| L10 | Bauteile aus dem Gebäudemodell übernehmen, verknüpft halten, abgleichen | ✓ (Dialog) | |
| L11 | Zeilen an der OZ ziehen; auf ein anderes LV ziehen (verschieben/kopieren, beauftragte LVs nur kopieren). Über zugeklappten Titeln kurz verweilen klappt sie auf. | ◐ | Auf anderes LV ziehen |
| L12 | Kopieren/Ausschneiden/Einfügen, Mehrfachauswahl wie unter Windows, Leiste für mehrere Zeilen, „Als Normal/Bedarf/Wahl“ für mehrere | ✓ (Art für mehrere, 27.11.) | Art für mehrere |
| L13 | Eigenschaften der Position (Allgemein · Weiteres · Menge · Grafik), Blättern „1 von 35“ | ✓ (Detailkarte; 27.11.: Blättern „1 von n“ in der Reihenfolge des Baums) | Blättern in der Karte |
| L14 | KG-Spalte mit Vorschlägen (KG des LV, benutzte, passend zum Gewerk). Ändert sich die KG des LV, ziehen Positionen ohne eigene KG mit. | ◐ (KG an der Position) | KG an der Position |
| L15 | GAEB-Prüfhinweis: Positionen außerhalb der häufigsten Titeltiefe, übersprungene Ebene, mehr als 4 Ebenen | ✓ (27.11.) | Hinweis in der Leiste |
| L16 | Sperre nach Vergabe 🔒/🔓, Warnung vor der ersten Änderung, beauftragte Nachträge einzeln gesperrt | ✓ (🔒 nach Vergabe, beauftragte Nachträge einzeln gesperrt – 27.11.) | |
| L17 | Kontextmenü: Position/Gliederungspunkt darin bzw. darunter, Hinweistext darunter, Eigenschaften, Langtext, Kopieren/Ausschneiden/Einfügen, Art setzen, Bietertextergänzung, Nachtrag aus dieser Position, In der Aufmaßprüfung zeigen, Umbenennen, Löschen | ◐ | Ergänzen (höchstens 6 Punkte, Rest unter „Weitere“) |
| L18 | Doppelklick auf das LV öffnet die LV- & Auftragsdaten. Diese haben drei Ebenen (Projekt → LV → Auftrag) mit Schildern für geerbte und eigene Werte. | ◐ | Doppelklick; Vererbung später |
| L19 | Export GAEB X83/X86, Excel, PDF (Druck mit Layout). Import GAEB, Excel/Tabelle. | ✓ (Excel aus und ein, 27.11.) | Excel aus und ein |
| L20 | LV löschen: Kette zeigen (Angebote, Auftrag, Rechnungen), zwei Warnungen, Papierkorb, wiederherstellen | ✓ (Kette, zweite Bestätigung, ein Rückgängig – 27.11.) | |
| L21 | Bietertextergänzung (GAEB), nur über das Kontextmenü | ✓ | |
| L22 | ✨ Langtext vorschlagen (KI) | ⊘ | KI vorerst raus (Entscheidung 26.11.) |
| L23 | Aus Baukosten | ⊘ | Kommt mit der App Baukosten |
| L24 | Dokument ablegen (LV als PDF/Scan lesen) | ⊘ | Gestrichen |

## Fenster- & Türliste

| # | Bisher | Neu | Plan |
|---|---|---|---|
| T1 | Mehrere Listen je Projekt, Gruppen und Systembeschreibung, ins LV, Abgleich | ✓ | |
| T2 | Tabelle wie Excel: Ausfüllkästchen mit Reihen, Strg+D/R, Strg+Enter, Kopieren/Einfügen aus Excel, Spaltenbreite und Zeilenhöhe | ◐ (Tabellen-Baustein) | Ausfüllen im Tabellen-Baustein |
| T3 | Darstellung: Ansichten, feste Lage-Spalten, Ausstattung als Marken, große Schrift | ✗ | |
| T4 | Räume aus dem Gebäudemodell, Türliste als PDF/Excel, Anlage zum LV-Druck | ✓ (Türliste drucken; 27.11.: Anlage zum LV-Druck, nur wenn Positionen aus einer Türliste stammen) | Druck und Anlage |

## Vergabe

| # | Bisher | Neu | Plan |
|---|---|---|---|
| V1 | Versand & Rücklauf: links die LVs (Anzahl Positionen, Summe), Termine Abgabe/Rückmeldung, Zähler (angeschrieben, abgegeben, wollen abgeben, geben nicht ab, offen) | ✓ | Layout wie bisher |
| V2 | Unterlagen für Bieter:innen: LV-PDF ohne Preise (immer dabei), GAEB X83, Pläne & Dateien, Dateien vom Rechner. Status „noch nicht verschickt“. | ◐ (LV-PDF, X83) | Unterlagen-Karte (Versand selbst später über die zentrale Versandstelle) |
| V3 | Bieter:innen suchen und mehrere anhaken, passendes Gewerk zuerst, neue Firma direkt anlegen | ◐ | |
| V4 | Je Bieter:in ein Verlauf: angeschrieben · nachgesandt · nachgefragt (Telefonnotiz, höchstens 10) · nächster Anruf (To-do) · Rückmeldung · Angebot eingegangen. Entfernen (🗑, Entf). | ◐ | |
| V5 | Senden (Mail mit Vorlagen je LV/Firma, Erinnerung, Nachsenden), mehrere LVs in einem Versand | ⊘ | Später über die zentrale Versandstelle (Entscheidung 26.11.) |
| V6 | Bieterliste drucken/Excel mit eigener Spaltenwahl | ✓ (27.11.: Knopf „Bieterliste“ im Versand, Spalten frei – auch Telefon, E-Mail, Ort der Firma; Excel über den Druck noch nicht) | Druck |
| V7 | Nachverfolgen über alle LVs | ✓ | |
| V8 | Preisspiegel im LV-Baum (Projekt → LVs → Titel mit Summe je Bieter:in → Positionen), Spalte Mittel, Bieter-Spalten ein/aus und ordnen | ✓ | Baum, Mittel, Spaltenwahl |
| V9 | Bieterangaben (Antworten auf Bietertextergänzungen aus X84) im Preisspiegel | ✓ (27.11.: Antworten aus dem X84 am Preis gespeichert, im Preisspiegel als Marke mit Hinweis an der Zelle) | |
| V10 | Angaben zum Angebot: Nachlass in % oder €, Skonto % / Tage, Eingang, ausgeschlossen | ✓ | % oder € |
| V11 | Angebot einlesen: X84 ✓, Excel ✗, PDF/Scan ⊘ | ✓ X84 und Excel/CSV (27.11.: „Import → Excel-Angebot“ im Preisspiegel, EP je OZ, ein Rückgängig); PDF/Scan ⊘ | Excel |
| V12 | Vergeben …, Vergabe aufheben (mit Rechnungen erst nach Rückfrage), Nicht vergeben (zählt nicht mehr für Budget und To-dos) | ✓ | Aufheben, Nicht vergeben |
| V13 | Klärungspunkte je Angebot: EP mehr als 30 % vom Mittel, Bedarfs-/Wahlpositionen. Sie gehen ins Protokoll. | ✓ (Klärungspunkte ins Protokoll, 27.11.) | |
| V14 | Angebotsbesprechung: Auswahlfelder mit üblichen Antworten, Abschließen (Angaben in Adressen/Auftragsdaten übernehmen, mit Haken), unterschriebene Fassung hinterlegen | ◐ (27.11.: Abschließen mit Haken – Rechtsform, Sitz, Handelsregister, Mitarbeiter:innen in die Adressen, nach der Vergabe die Ausführungszeit ins LV, ein Rückgängig; unterschriebene Fassung hinterlegen fehlt) | Abschließen, Hinterlegen |

## Prüfung und Abrechnung

| # | Bisher | Neu | Plan |
|---|---|---|---|
| A1 | Aufträge als Baum über alle LVs. Spalten: Bezeichnung, Menge, EH, Art, KG, EP Auftrag, EP Schätz., GP, Prognose, abgerechnet. Sortieren je Ebene, Spaltenwahl. | ✓ | Baum wie im LV |
| A2 | Nachtrag: Gliederungspunkt/Position, Eingabezeile wie Excel (auch aus der Zwischenablage), Nachtragsangebot einlesen, aus Position ableiten (Mehrmenge / geänderte Leistung), ans Ende/an OZ, verschieben | ◐ (Gliederung, Position, Mehrmenge aus dem Aufmaß) | |
| A3 | Stände des Nachtrags (angemeldet · angeboten · geprüft · beauftragt · abgelehnt), Nachtragsakte mit Prüfablauf (je Projekt oder ab Auftragssumme) | ◐ (Stände) | Stände; Prüfablauf später |
| A4 | Auftrag ohne LV („Zettelwirtschaft“: Firma, Summe, KG) | ✓ (27.11.) | |
| A5 | Vertrag: Bauvertrag, Auftragsschreiben, Vergabe aufheben | ✓ (27.11.: Auftragsschreiben als zweiter Ausdruck desselben Vertrags – Brief mit Anrede, Abschnitten ohne §, Bitte um Bestätigung) | Auftragsschreiben |
| A6 | Auftragskarte rechts: Konditionen (Nachlass, Skonto) mit Hinweis bei Abweichung vom Angebot, Bedingungen, Sicherheiten | ✓ (27.11.: Konditionen stehen nur einmal – am beauftragten Angebot –, daher kann keine Abweichung entstehen; Skontofrist zählbar in Kalender-, Werk-, Arbeitstagen oder Wochen wie bisher) | |
| A7 | Aufmaß je Rechnung: kumulierende Kette (Abschlag → Schluss, Nachtrag), Rechenweg als Stand oder „+“ Zuwachs, Leiste der Rechnungen mit Farben, Mengenüberschreitung als Balken (100/110 %), Datum/Ort/Raum je Zeile | ✓ (27.11.) | Ausbauen |
| A8 | Mengen der Firma als Zeile „lt. Firma“ übernehmen (eine oder alle), Nachtrag direkt aus dem Aufmaß | ✓ | |
| A9 | PDF der Firma daneben mit Haken ✔/✘ direkt im Dokument, automatische Marken | ⊘ vorerst | Erst Abgleich ohne Scan (Merkzettel 25.11.) |
| A10 | Rechnungsarten: Abschlag, Schluss, Nachtrag, Regie/Stundenlohn, Sicherheit, ohne LV; offene Rechnung derselben Kette sperrt neue | ✓ (Einzelrechnung ohne LV dazu) | |
| A11 | Prüfen Schritt für Schritt (Rechnung → Prüfweg → Leistung → Abzüge → Freigabe) | ✓ (27.11.) | Assistent |
| A12 | Rechnungsfreigabe als PDF-Paket (Freigabe, Prüfblatt, Massenermittlung, Rechnung der Firma), „GEPRÜFT ablegen“, Freigabe von Hand mit Pflichtgrund | ◐ (Freigabe, Prüfblatt, Massenermittlung, ablegen – ohne Rechnung der Firma) | Ausdrucke |
| A13 | Rechenleiter, Skonto je Rechnung, Zahlungen, Sicherheiten, Bürgschaft | ✓ | |
| A14 | Kostenübersicht | ✓ | |

## Einstellungen

| # | Bisher | Neu | Plan |
|---|---|---|---|
| E1 | Schema für Vergabe- und Auftragsnummern | ✓ (Büro → Ausschreibung, Vorschlag an der LV-Karte – 27.11.) | Verwaltung |
| E2 | Abrechnung: welche Nachträge als Leistung zählen | ✓ (27.11.: Verwaltung → Büro → Abrechnung: angemeldete und beauftragte oder nur beauftragte Nachträge; abgelehnte zählen nie – vorher zählten sie mit; Mehrmenge gelb/rot ab einstellbarem %) | Verwaltung |
| E3 | Nachtragsabwicklung einfach oder mit Prüfablauf | ✗ | Später |

## Reihenfolge

1. Rahmen und Optik: R1 Navigation, R2 Kopf, R4 Kennzahlen, Klappen ▸/▾
2. L1–L3 LV als Baum, L14 KG
3. V8 Preisspiegel im Baum, V12, V10
4. A1 Aufträge als Baum, A4, A5
5. V1–V4 Versand-Seite, V6
6. A7, A8, A10–A12 Aufmaß und Rechnungen
7. R12 Handyansicht
8. Der Rest der Liste
