// Aufbau als Netz: Bausteine (Objekte oder Dateien) und wer auf wen zeigt – dazu das Umfeld eines Bausteins
// (Herkunft links, Ziel rechts, eine oder zwei Stufen tief) und die Prüfregeln für den Aufbau. Ein Baustein für
// das Bild in der Verwaltung, die Schnittstelle /api/aufbau/… und die Tests – alle bekommen dieselben Antworten.
import type { Beipackzettel } from './modul';

export interface Datei { pfad: string; bereich: string; zeilen: number; beschreibung: string; bindetEin: string[]; stelltBereit: string[] }
export interface Quelltext { erzeugt: string; bereiche: { id: string; titel: string; text: string }[]; bausteine: Datei[] }
export interface Knoten { id: string; titel: string; gruppe: string; unter: string; lang: string }
export interface Netz { gruppen: { id: string; titel: string; text: string }[]; knoten: Knoten[]; kanten: [string, string][]; herkunft: string; ziel: string }
export interface Spalte { titel: string; seite: 'herkunft' | 'mitte' | 'ziel'; stufe: number; ids: string[] }
export interface Befund { regel: string; stufe: 'fehler' | 'hinweis'; baustein: string; text: string }

/** Daten: je Modul eine Gruppe mit seinen Objekten; Kante = Verweis eines Objekts auf ein anderes. */
export function datenNetz(module: Beipackzettel[]): Netz {
  return {
    gruppen: module.map((m) => ({ id: m.id, titel: m.name, text: m.beschreibung })),
    knoten: module.flatMap((m) => m.objekte.map((o) => ({ id: o.name, titel: o.titel, gruppe: m.id, unter: `${o.felder.length} Felder`, lang: `${o.titel} (${o.name}) – ${m.name}` }))),
    kanten: module.flatMap((m) => m.objekte.flatMap((o) => [...new Set(o.felder.filter((f) => f.art === 'verweis' && f.ziel && f.ziel !== o.name).map((f) => f.ziel!))].map((z): [string, string] => [o.name, z]))),
    herkunft: 'verweist hierher', ziel: 'verweist auf',
  };
}

const kurzname = (pfad: string) => pfad.replace(/^src\/(kern|server|ui\/baukasten|ui\/unterbau|ui|module)\//, '').replace(/^dienste\//, '').replace('/beipackzettel.ts', '');
/** Code: je Bereich eine Gruppe mit seinen Dateien; Kante = Datei bindet Datei ein. Betrieb und Tests bleiben außen vor. */
export function codeNetz(q: Quelltext): Netz {
  const bereiche = q.bereiche.filter((b) => b.id !== 'betrieb');
  const dateien = q.bausteine.filter((d) => bereiche.some((b) => b.id === d.bereich));
  const da = new Set(dateien.map((d) => d.pfad));
  return {
    gruppen: bereiche,
    knoten: dateien.map((d) => ({ id: d.pfad, titel: kurzname(d.pfad), gruppe: d.bereich, unter: `${d.zeilen}`, lang: `${d.pfad} · ${d.zeilen} Zeilen` })),
    kanten: dateien.flatMap((d) => d.bindetEin.filter((z) => da.has(z) && z !== d.pfad).map((z): [string, string] => [d.pfad, z])),
    herkunft: 'wird gebraucht von', ziel: 'bindet ein',
  };
}

/** Umfeld eines Bausteins: links, was auf ihn zeigt (Herkunft), rechts, worauf er zeigt (Ziel) – Stufe 2 schließt an Stufe 1 an. */
export function umfeld(n: Netz, wahl: string, tiefe: 1 | 2): Spalte[] {
  const ein = new Map<string, Set<string>>(), aus = new Map<string, Set<string>>();
  for (const [v, z] of n.kanten) { (ein.get(z) ?? ein.set(z, new Set()).get(z)!).add(v); (aus.get(v) ?? aus.set(v, new Set()).get(v)!).add(z); }
  const knoten = new Map(n.knoten.map((k) => [k.id, k]));
  const reihe = new Map(n.gruppen.map((g, i) => [g.id, i]));
  const ordnen = (ids: Iterable<string>) => [...new Set(ids)].filter((id) => knoten.has(id))
    .sort((a, b) => (reihe.get(knoten.get(a)!.gruppe) ?? 0) - (reihe.get(knoten.get(b)!.gruppe) ?? 0) || knoten.get(a)!.titel.localeCompare(knoten.get(b)!.titel, 'de'));
  const weiter = (von: string[], nach: Map<string, Set<string>>, ohne: Set<string>) => ordnen(von.flatMap((id) => [...(nach.get(id) ?? [])]).filter((id) => !ohne.has(id)));
  if (!knoten.has(wahl)) return [];
  const l1 = ordnen(ein.get(wahl) ?? []), r1 = ordnen(aus.get(wahl) ?? []);
  const s: Spalte[] = [];
  if (tiefe === 2) s.push({ titel: 'Herkunft, 2. Stufe', seite: 'herkunft', stufe: 2, ids: weiter(l1, ein, new Set([wahl, ...l1])) });
  s.push({ titel: 'Herkunft', seite: 'herkunft', stufe: 1, ids: l1 }, { titel: 'Gewählt', seite: 'mitte', stufe: 0, ids: [wahl] }, { titel: 'Ziel', seite: 'ziel', stufe: 1, ids: r1 });
  if (tiefe === 2) s.push({ titel: 'Ziel, 2. Stufe', seite: 'ziel', stufe: 2, ids: weiter(r1, aus, new Set([wahl, ...r1])) });
  return s;
}

/** Wer darf wen einbinden: Von links nach rechts baut eins aufs andere auf. */
const DARF: Record<string, string[]> = {
  kern: ['kern'],
  module: ['kern', 'module'],
  unterbau: ['kern', 'unterbau'],
  baukasten: ['kern', 'unterbau', 'baukasten'],
  oberflaeche: ['kern', 'module', 'unterbau', 'baukasten', 'oberflaeche'],
  server: ['kern', 'module', 'server'],
};
const EINSTIEG = new Set(['src/server/start.ts', 'src/ui/main.tsx']);

/** Prüfregeln für den Aufbau: Schichten, Kreise, Beschreibung, ungenutzte Dateien, sehr lange Dateien, Verweise auf Unbekanntes. */
export function pruefen(q: Quelltext | null, module: Beipackzettel[]): Befund[] {
  const b: Befund[] = [];
  const objekte = new Set(module.flatMap((m) => m.objekte.map((o) => o.name)));
  for (const m of module) for (const o of m.objekte) for (const f of o.felder)
    if (f.art === 'verweis' && (!f.ziel || !objekte.has(f.ziel))) b.push({ regel: 'verweis', stufe: 'fehler', baustein: o.name, text: `Feld „${f.name}“ verweist auf ein unbekanntes Objekt (${f.ziel ?? '–'})` });
  if (!q) return b;
  const quelle = q.bausteine.filter((d) => /\.(ts|tsx)$/.test(d.pfad) && d.pfad.startsWith('src/'));
  const nach = new Map(q.bausteine.map((d) => [d.pfad, d]));
  for (const d of quelle) {
    for (const z of d.bindetEin) {
      const ziel = nach.get(z);
      if (ziel && DARF[d.bereich] && !DARF[d.bereich]!.includes(ziel.bereich))
        b.push({ regel: 'schicht', stufe: 'fehler', baustein: d.pfad, text: `bindet ${z} ein – ${d.bereich} darf nur ${DARF[d.bereich]!.join(', ')} einbinden` });
    }
    if (!d.beschreibung) b.push({ regel: 'beschreibung', stufe: 'fehler', baustein: d.pfad, text: 'hat keine Beschreibung am Dateianfang' });
    if (d.zeilen > 800) b.push({ regel: 'laenge', stufe: 'hinweis', baustein: d.pfad, text: `${d.zeilen} Zeilen – lässt sich vielleicht in Bausteine teilen` });
  }
  const gebraucht = new Set(q.bausteine.flatMap((d) => d.bindetEin));
  for (const d of quelle) if (!EINSTIEG.has(d.pfad) && !gebraucht.has(d.pfad)) b.push({ regel: 'ungenutzt', stufe: 'hinweis', baustein: d.pfad, text: 'wird nirgends eingebunden' });
  // Kreise: A bindet B ein, B (über andere) wieder A
  const farbe = new Map<string, 1 | 2>(), stapel: string[] = [], gemeldet = new Set<string>();
  const besuch = (p: string) => {
    farbe.set(p, 1); stapel.push(p);
    for (const z of nach.get(p)?.bindetEin ?? []) {
      if (!nach.has(z)) continue;
      if (farbe.get(z) === 1) {
        const kreis = stapel.slice(stapel.indexOf(z));
        const schluessel = [...kreis].sort().join('|');
        if (!gemeldet.has(schluessel)) { gemeldet.add(schluessel); b.push({ regel: 'kreis', stufe: 'hinweis', baustein: z, text: `Kreis: ${[...kreis, z].map(kurzname).join(' → ')}` }); }
      } else if (!farbe.has(z)) besuch(z);
    }
    stapel.pop(); farbe.set(p, 2);
  };
  for (const d of quelle) if (!farbe.has(d.pfad)) besuch(d.pfad);
  return b.sort((x, y) => Number(x.stufe === 'hinweis') - Number(y.stufe === 'hinweis') || x.regel.localeCompare(y.regel) || x.baustein.localeCompare(y.baustein));
}

export const REGELN: Record<string, string> = {
  schicht: 'Schichten: Der Kern kennt niemanden, die Module nur den Kern, der Unterbau der Oberfläche nur den Kern, der Baukasten nur Kern, Unterbau und sich selbst – keine Ansichten; Server und Oberfläche kennen einander nie.',
  verweis: 'Verweise im Datenmodell zeigen auf ein vorhandenes Objekt.',
  beschreibung: 'Jede Datei sagt am Anfang, was sie ist.',
  kreis: 'Dateien binden sich nicht im Kreis ein.',
  ungenutzt: 'Jede Datei wird gebraucht – sonst kann sie weg.',
  laenge: 'Sehr lange Dateien lassen sich oft in Bausteine teilen.',
};
