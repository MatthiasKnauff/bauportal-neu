# Katalog-Kanal des Bauportals

Von hier holt sich jedes Bauportal seine Kataloge (Verwaltung → Updates) – unabhängig von Programmversionen.

- `index.json` – was es gibt: je Katalog Fassung, Stand, Quelle, Datei und Prüfsumme (SHA-256)
- `<katalog>/<katalog>-<fassung>.json` – die Einträge; jede Fassung ist eine eigene Datei und wird nie nachträglich geändert
- große Kataloge (z. B. die Positionsdatenbank) bestehen aus Teilen: statt `datei`/`sha256` steht in `index.json` eine Liste `teile` mit Datei und Prüfsumme je Teil

Neue Fassung: neue Datei anlegen, in `index.json` Fassung, Stand, Datei und Prüfsumme nachziehen. Das Bauportal
prüft die Prüfsumme, zeigt eine Vorschau der Änderungen und überschreibt nichts, was ein Büro selbst geändert hat.
