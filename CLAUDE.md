# Bauportal (Neuaufbau) – Regeln für die Arbeit an diesem Repo

Diese Datei gilt für jede Sitzung und jedes Werkzeug, das an diesem Code arbeitet (Claude-Chats, Claude Code aus der App, externe Entwickler:innen). Antworten und Commit-Texte auf Deutsch.

## Grundsätze
- **Kein alter Code.** Nichts aus dem bisherigen Bauportal (`MatthiasKnauff/bauplattform`) übernehmen. Fachliches Verhalten des alten Bauportals gilt als entschieden und wird übernommen – der Code wird neu geschrieben.
- **Alten Code lesen ist erlaubt** (Entscheidung 26.11.2026): Den Quelltext des alten Bauportals lesen, um seine Funktionen genau zu verstehen (Felder, Regeln, Rechenwege, Sonderfälle). Daraus wird nach unseren Regeln komplett neu gebaut – nichts kopieren, nicht abschreiben, keine alte Struktur nachbauen, wo unsere Bausteine es anders lösen.
- **Ursache statt „Sahne“.** Fehler immer an der Ursache beheben. Keine zusätzlichen Absicherungen, Umwege oder Doppelprüfungen, die einen Fehler nur verdecken – auch nicht vorschlagen. Vor dem Beheben kurz sagen, wo die Ursache liegt und was geändert wird.
- **Bausteine wiederverwenden.** Gleiche Funktion = gleicher Baustein (Rückgängig, Detailkarte, Tabelle, Baum, Dialoge …). Vorhandene Bausteine nutzen und dabei möglichst andere überflüssig machen. Anpassungen nur über die vorgesehenen Stellschrauben eines Bausteins, nie „drüber programmieren“. Was codetechnisch sehr aufwendig wird, vorher melden.
- **Look & Feel** des bisherigen Bauportals bleibt (Werte und Bedienregeln übernehmen, nicht den Code). Aufbau jeder App: Kopfleiste, Abfolge-Leiste (nur mit Abfolge), Menüleiste (Vorwärts/Rückwärts am Anfang), darunter Baum links · Inhalt Mitte · Details rechts; links/rechts ausblendbar, keine gemeinsame Fußzeile.
- **Bedienregeln:** OK speichert und schließt, Abbrechen verwirft mit Rückfrage, links Abbrechen/rechts Hauptknopf · Dialoge nur über Knöpfe schließen · keine Systemdialoge (eigene Auswahl statt nativer Listen) · Kontextmenü höchstens 6 Punkte · kein horizontaler Scrollbalken in der Standardbreite · Spaltenauswahl und -reihenfolge in allen Tabellen · Dinge direkt verschiebbar ohne Bearbeiten-Modus · Warte-Hinweis ab 1,5 s · Elemente springen beim Eintragen nicht.
- **Geschwindigkeit:** höchstens 50 ms je Klick – als Grenze in den Tests.
- **Nie zu viele Meldungen:** Erinnerungen und Systemmails laufen über die eine zentrale Stelle, gebündelt und zurückhaltend voreingestellt.
- **Datenschutz zuerst:** Alles, was an eine KI geht, läuft über den KI-Ausgang (Anonymisierung, Protokoll, Kostendeckel). KI schlägt vor, der Mensch bestätigt.
- **Dateiablage:** Originale bleiben im Dateisystem, in der Datenbank höchstens Vorschaubilder. Der Testserver darf die Ablage nur lesen.
- **Mocks/Entwürfe hell**; offene Entscheidungen rot, entschiedene grün.

## Architektur (Kurzfassung)
TypeScript (Server und Oberfläche, SolidJS), PostgreSQL; Python nur für Hilfsdienste (`dienste/`: Datei, IFC, Druck, KI). Jede Änderung ist ein Befehl im Protokoll (Rückgängig, Abgleich, Herkunft je Wert). Datenmodell einmal im Beipackzettel des Moduls beschreiben (`src/module/*/beipackzettel.ts`), alles andere daraus erzeugen. Rechte sitzen in der Datenbank. Den aktuellen Aufbau zeigt `tools/aufbau.mjs` bzw. Verwaltung → Aufbau – vor größeren Änderungen dort lesen.

## Arbeitsablauf
- Vor dem Push: `npm run typen` und `npm test` lokal grün; bei Oberflächen-Änderungen auch `npm run test:klick`.
- Vor dem Push `git pull --rebase` (mehrere Sitzungen können parallel pushen).
- Push auf `main` → Testserver (bauportal-test.knauff.info, docker2). Produktion (bauportal.knauff.info, docker3) nur über ein Release, das Matthias selbst freigibt.
- Nach jedem Push melden: Liste der Änderungen, welcher Build grün ist und was damit auf dem Testserver ist, dazu der Freigabe-Link mit der nächsten Versionsnummer: `https://github.com/MatthiasKnauff/bauportal-neu/releases/new?tag=v<nächste Version>&target=main`. Wenn der Build fertig ist, eine Push-Nachricht schicken.
- Fragen an Matthias zum Anklicken stellen, gesammelt am Anfang eines Blocks; nach seinem GO ohne Rückfrage bis zur ersten fertigen Version durcharbeiten.
- Zeitangaben nicht in Entwickler-Tagen/Wochen.
- Handbuch und Dokumentation nicht nach jedem Build neu erstellen – nur auf Zuruf.
- Umstieg Modul für Modul: das alte Bauportal läuft weiter, bis das jeweilige Modul hier fertig ist.
