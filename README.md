# bauportal-neu

Neuaufbau des Bauportals. Kein Code aus dem alten Bauportal.



## So kommt eine Änderung auf die Server

1. **Push auf `main`** – GitHub baut das Image. Die Pipeline schreibt die fertige Compose-Datei in den Zweig
   `deploy-test`, Portainer bemerkt das (spätestens nach einer Minute) und aktualisiert den **Testserver**.
2. **Testserver ansehen** – oben steht „Testserver – wird vX.Y.Z“.
3. **Release freigeben** – [neues Release anlegen](https://github.com/MatthiasKnauff/bauportal-neu/releases/new?target=main).
   Die Pipeline baut das Image mit der Versionsnummer, schreibt es in `deploy-prod`, und Portainer
   aktualisiert den **Produktivserver**.

| | Server |
|---|---|
| Test | docker2 · Port 8300 · https://bauportal-test.knauff.info · Volume `bauportal-neu-test` |
| Produktiv | docker3 · Port 8300 · https://bauportal.knauff.info · Volume `bauportal-neu-prod` |

## Was das Programm heute kann (Durchstich)

Das Modul **Adressen** läuft einmal durch alle Schichten des neuen Fundaments:

- **Datenmodell einmal beschrieben** – `src/module/adressen/beipackzettel.ts`. Daraus entstehen Tabelle, Prüfung, Befehle, Tabelle und Detailkarte der Oberfläche.
- **Befehlsprotokoll** – jede Änderung ist ein Befehl (`kern_befehl`). Rückgängig ist ein Gegenbefehl.
- **Daten im Gerät** – die Oberfläche arbeitet auf ihrem eigenen Bestand (IndexedDB), auch ohne Netz; Änderungen warten in einer Schlange.
- **Abgleich** – andere Geräte bekommen Änderungen live. Verschiedene Felder fließen zusammen; beim selben Feld gewinnt die letzte Eingabe, beide Seiten bekommen einen Hinweis.
- **Anmeldung** – beim ersten Aufruf wird das Administrator-Konto angelegt, weitere Benutzer im Menü oben rechts.

## Technik

TypeScript durchgehend, SolidJS für die Oberfläche, PostgreSQL. Ein Programm, ein Container (plus Datenbank).

| Ordner | Inhalt |
|---|---|
| `src/kern` | Datenmodell, Befehle, Modulgerüst – gilt für Server und Oberfläche |
| `src/module` | die Module, je mit Beipackzettel; `index.ts` ist die Liste aller Module |
| `src/server` | Datenbank, Protokoll, Anmeldung, HTTP und Live-Strom |
| `src/ui` | Oberfläche: `abgleich.ts` (Daten im Gerät), `baukasten/` (Bausteine für alle Module) |
| `tests` | Tests für Kern und Server (laufen in der Pipeline gegen PostgreSQL) |

Lokal: `npm ci`, `npm run typen`, `npm test`, `npm run build`, `npm start` (braucht `DATABASE_URL`).

## Aufbau der Bereitstellung

- `deploy/compose.template.yml` – Compose-Datei für beide Server (Ports und Variablen kommen aus Portainer)
- `.github/workflows/deploy.yml` – Pipeline
- Zweige `deploy-test` / `deploy-prod` – werden von der Pipeline geschrieben, nicht von Hand ändern

Eingerichtet mit der Deploy-Automatik.
