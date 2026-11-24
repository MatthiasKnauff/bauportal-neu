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
- **Einrichtungsassistent** – beim ersten Aufruf: Büro, Administrator-Konto, auf Wunsch ein Musterprojekt.
- **Rollen und Rechte in der Datenbank** – Administrator:in, Büroleitung, Bauleitung, Mitarbeiter:in, Gast. PostgreSQL selbst lässt nur durch, was die Rolle darf
  (Leseregeln je Tabelle, Prüfung jeder Änderung – `src/server/db.ts`). Die Rechte sind Daten (Objekt `recht`) und in der Verwaltung einstellbar.
- **Projekte** – sichtbar für Mitglieder und für Rollen, die alle Projekte sehen. Jedes Gerät bekommt nur, was sein Benutzer sehen darf.
- **Benutzer, Rechte, Bürodaten** sind Objekte wie alle anderen: Änderungen laufen über Befehle, mit Protokoll und Rückgängig. Kennwörter stehen nie im Protokoll.

### Baukasten der Oberfläche (`src/ui/baukasten`)

Jede App hat denselben Aufbau (`rahmen.tsx`): **Kopfleiste** · **Abfolge-Leiste** (nur bei Apps mit Abfolge) · **Menüleiste** · darunter drei Plätze
**Baum | Inhalt | Details**. Jeder Teil ist ein fertiger Baustein, den die App nur auf seinen Platz setzt. Zugeklappte Plätze geben ihren Platz an die Mitte ab;
am Handy stehen die Plätze nacheinander. Was ein Modul an einem Baustein verändern darf, steht an einer Stelle: `anpassung.ts` (Stellschrauben).
Fehlt eine, kommt sie dort dazu und gilt dann für alle – im Modul wird nichts „drübergebaut“.

- **Baum** (`baum.tsx`), **Tabelle** (`tabelle.tsx`), **Detailkarte** (`detailkarte.tsx`), **Menüleiste**, **Abfolge-Leiste**, **Kopfleiste**.
  `objektansicht.tsx` setzt sie für ein Objekt aus dem Datenmodell zusammen; der Baum gliedert nach den Feldern, die der Beipackzettel nennt.
- **Tabelle**: Suchen, Sortieren, Spalten ein-/ausblenden, ordnen und in der Breite ziehen (je Benutzer und Gerät gemerkt),
  Tastatur (Pfeile, Bild auf/ab, Pos1/Ende, Enter, Entf, Esc, `/` für die Suche), Kontextmenü, Karte zuklappen oder in ein eigenes Browserfenster legen.
  Im Dokument stehen nur die sichtbaren Zeilen – gemessen mit 5000 Kontakten: Klick auf eine Zeile unter 25 ms, Sortieren und Suchen unter 50 ms.
- **Feld**, **Auswahlliste** (eigene Liste mit Suche statt Browser-Auswahl), **Fenster**, **Formular**, **Hinweis** (mit Rückgängig), **Kontextmenü** (höchstens 6 Punkte).
- Warte-Hinweis bei allem, was länger als 1,5 Sekunden dauert.

### Versionen (im Kern, für alle Module gleich)

Je Projekt und Bereich (z. B. Bauzeitenplan) gibt es benannte, unabhängig bearbeitbare Versionen; genau eine ist gültig (`src/server/versionen.ts`).
Neue Version auf drei Wegen: aus der aktuellen, leer, aus einem anderen Projekt – welche Wege gelten, steht im Beipackzettel des Moduls.
Kopieren läuft als ein Vorgang auf dem Server (alle Einträge oder keiner). Die Versionsleiste ist ein Baustein.

### Ablage (Dateiserver)

Die Originale bleiben auf dem Dateiserver. Das Bauportal verbindet sich selbst mit der Freigabe (SMB); Freigabe und Benutzer stehen in der
Verwaltung, das Kennwort verschlüsselt in der Datenbank (Schlüssel im Daten-Volume, `src/server/ablage.ts`).
Mit dem Dateiserver spricht der **Dateidienst** (`dienste/dateidienst`, Python, eigener Container ohne Port nach außen); er merkt sich nichts.
Der Testserver liest die Ablage nur. Sichtbar ist der Ordner eines Projekts für alle, die das Projekt sehen dürfen.

### Gebäudemodell und Herkunft je Wert

Gebäude → Geschosse → Räume und Bauteile, je Projekt in Versionen (`src/module/gebaeudemodell`). Es darf ungenau beginnen oder leer bleiben.
Der Kern führt für jedes Feld jedes Objekts die **Herkunft**: Ein Befehl kann sagen, woher seine Werte stammen (`ifc`, `geschaetzt`, `assistent` …);
eine Eingabe von Hand nimmt die Kennzeichnung wieder weg. Die Oberfläche zeigt sie in Karte und Tabelle. Beim Kopieren einer Version wandert sie mit.
Verweise zwischen Objekten (Geschoss → Gebäude) bieten nur an, was zum selben Projekt und zur selben Version gehört.

### Module

Adressen · Gebäudemodell (Bauteile, Räume, Geschosse, Gebäude) · Projekte (Mitglieder, Beteiligte, Versionen, Ordner auf dem Dateiserver) · Pläne und Dateien (Projektordner durchblättern, ansehen, herunterladen) · Bautagebuch (nummerierte Tagesberichte je Projekt) ·
Bauzeitenplan (Vorgänge mit Terminen in Versionen; der Balkenplan folgt) · Verwaltung (Benutzer, Rechte, Büro).
Das Projekt wird einmal oben gewählt und gilt in allen Apps.

## Technik

TypeScript durchgehend, SolidJS für die Oberfläche, PostgreSQL. Ein Programm, ein Container – dazu die Datenbank und der Dateidienst (Python) als Hilfsdienst.

| Ordner | Inhalt |
|---|---|
| `src/kern` | Datenmodell, Befehle, Modulgerüst – gilt für Server und Oberfläche |
| `src/module` | die Module, je mit Beipackzettel; `index.ts` ist die Liste aller Module |
| `src/server` | Datenbank, Protokoll, Anmeldung, HTTP und Live-Strom |
| `src/ui` | Oberfläche: `abgleich.ts` (Daten im Gerät), `baukasten/` (Bausteine für alle Module) |
| `tests` | Tests für Kern und Server (laufen in der Pipeline gegen PostgreSQL); `tests/ui/klick.mjs` misst im Browser: Klick in einer Liste mit 2000 Einträgen unter 50 ms |

Lokal: `npm ci`, `npm run typen`, `npm test`, `npm run build`, `npm start` (braucht `DATABASE_URL`).

## Aufbau der Bereitstellung

- `deploy/compose.template.yml` – Compose-Datei für beide Server (Ports und Variablen kommen aus Portainer)
- `.github/workflows/deploy.yml` – Pipeline
- Zweige `deploy-test` / `deploy-prod` – werden von der Pipeline geschrieben, nicht von Hand ändern

Eingerichtet mit der Deploy-Automatik.
