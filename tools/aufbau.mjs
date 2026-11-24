// Liest den Quelltext und schreibt den Aufbau des Programms als Daten: jede Datei ein Baustein mit seiner
// Beschreibung (der Kommentar am Dateianfang), seiner Größe, dem, was er bereitstellt, und dem, was er einbindet.
// Daraus zeichnet die Verwaltung den Aufbau (Punkt 31 der Anforderungen) – immer passend zum gebauten Stand.
// Aufruf beim Bauen: node tools/aufbau.mjs dist/aufbau.json
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Bereiche des Programms, in der Reihenfolge, in der sie aufeinander aufbauen
export const BEREICHE = [
  { id: 'kern', titel: 'Kern', ordner: 'src/kern', text: 'Datenmodell, Befehle, Module, Druckwerk, Anonymisierung – ohne Datenbank und ohne Oberfläche; läuft im Browser und auf dem Server gleich.' },
  { id: 'module', titel: 'Module', ordner: 'src/module', text: 'Je Modul ein Beipackzettel: Objekte, Ansichten, Ausdrucke, Kataloge. Hier steht, WAS es gibt – nicht, wie es gezeigt oder gespeichert wird.' },
  { id: 'server', titel: 'Server', ordner: 'src/server', text: 'Datenbank, Befehlsprotokoll, Rechte, Anmeldung und die Wege nach außen (Ablage, IFC, Druck, KI, Wetter, Updates).' },
  { id: 'oberflaeche', titel: 'Oberfläche', ordner: 'src/ui', text: 'Portal, Abgleich mit dem Server (local-first) und die Ansichten, die über die Bausteine hinausgehen.' },
  { id: 'baukasten', titel: 'Baukasten', ordner: 'src/ui/baukasten', text: 'Die fertigen Bausteine der Oberfläche. Module stellen nur an den vorgesehenen Stellschrauben (anpassung.ts).' },
  { id: 'dienste', titel: 'Hilfsdienste', ordner: 'dienste', text: 'Eigene kleine Container in Python für das, was besondere Programme braucht: Dateiserver, IFC, PDF, KI. Nur für das Bauportal erreichbar, merken sich nichts.' },
  { id: 'betrieb', titel: 'Betrieb und Tests', ordner: '', text: 'Bauen, Ausliefern, Prüfen: Pipeline, Container, Tests, Werkzeuge.' },
];

function dateien(ordner, aus = []) {
  for (const n of readdirSync(path.join(WURZEL, ordner)).sort()) {
    if (n === 'node_modules' || n === 'dist' || n === '__pycache__' || n.startsWith('.git')) continue;
    const p = path.posix.join(ordner, n);
    if (statSync(path.join(WURZEL, p)).isDirectory()) dateien(p, aus); else aus.push(p);
  }
  return aus;
}

/** Der Kommentar am Anfang einer Datei – das ist ihre Beschreibung. */
export function beschreibung(text, pfad) {
  if (pfad.endsWith('.py')) return (/^\s*(?:#[^\n]*\n)*\s*"""([\s\S]*?)"""/.exec(text)?.[1] ?? '').trim();
  const zeilen = [];
  for (const z of text.split('\n')) {
    const t = z.trim();
    if (t.startsWith('//')) zeilen.push(t.replace(/^\/\/\s?/, ''));
    else if (t.startsWith('#') && !t.startsWith('#!')) zeilen.push(t.replace(/^#\s?/, ''));
    else if (t === '' && !zeilen.length) continue;
    else break;
  }
  return zeilen.join('\n').trim();
}

export function aufbauLesen() {
  const alle = [...dateien('src'), ...dateien('dienste'), ...dateien('tools'), ...dateien('tests'), ...dateien('deploy'), ...dateien('public'), ...dateien('.github'), 'Dockerfile', 'README.md']
    .filter((p) => /\.(ts|tsx|mjs|js|py|yml|sh|css|md)$|Dockerfile$/.test(p));
  const bausteine = alle.map((pfad) => {
    const text = readFileSync(path.join(WURZEL, pfad), 'utf8');
    const bereich = [...BEREICHE].sort((a, b) => b.ordner.length - a.ordner.length).find((b) => b.ordner && (pfad === b.ordner || pfad.startsWith(b.ordner + '/')))?.id ?? 'betrieb';
    // was die Datei einbindet (nur eigene Dateien) und was sie bereitstellt
    const bindetEin = [...text.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"\n]*?from\s+['"](\.[^'"]+)['"]/g)].map((m) => {
      const ziel = path.posix.normalize(path.posix.join(path.posix.dirname(pfad), m[1]));
      return alle.find((p) => p === ziel || p === ziel + '.ts' || p === ziel + '.tsx' || p === ziel + '.mjs');
    }).filter(Boolean);
    const stelltBereit = [...text.matchAll(/(?:^|\n)export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+(\w+)/g)].map((m) => m[1]);
    return { pfad, bereich, zeilen: text.split('\n').length, beschreibung: beschreibung(text, pfad), bindetEin: [...new Set(bindetEin)], stelltBereit };
  });
  return { erzeugt: new Date().toISOString(), bereiche: BEREICHE.map(({ id, titel, text }) => ({ id, titel, text })), bausteine };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ziel = process.argv[2] ?? 'dist/aufbau.json';
  const a = aufbauLesen();
  mkdirSync(path.dirname(ziel), { recursive: true });
  writeFileSync(ziel, JSON.stringify(a));
  console.log(`Aufbau: ${a.bausteine.length} Bausteine, ${a.bausteine.reduce((s, b) => s + b.zeilen, 0)} Zeilen, ${a.bausteine.filter((b) => !b.beschreibung && /\.(ts|tsx|py)$/.test(b.pfad)).length} ohne Beschreibung → ${ziel}`);
}
