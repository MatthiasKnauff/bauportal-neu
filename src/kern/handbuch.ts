// Handbuch des Bauportals (Entscheidung 25.11.2026): entsteht aus dem Programm selbst – Apps, Ansichten mit ihren Hilfetexten
// (Beipackzettel), Felder, Rollen und Rechte – in drei Stufen: Anwender:innen, Administrator:innen, Entwickler:innen.
// Hier steht nur, WAS hineinkommt (reine Rechnung); wann es neu entsteht (nachts, nur bei Änderungen) regelt der Server.
import type { Beipackzettel } from './modul';
import type { FeldArt, ObjektModell } from './modell';
import { ROLLEN } from './rechte';

export type Handbuchstufe = 'anwender' | 'admin' | 'entwickler';
export const STUFEN: { wert: Handbuchstufe; titel: string }[] = [{ wert: 'anwender', titel: 'Anwender:innen' }, { wert: 'admin', titel: 'Administrator:innen' }, { wert: 'entwickler', titel: 'Entwickler:innen' }];

/** Bedienung, die überall gleich ist – für die Hilfe „?“ und das Handbuch. */
export const UEBERALL: [string, string][] = [
  ['Strg+K', 'Suche über alles – Projekte, Firmen, Berichte, Leistungen …'],
  ['Strg+Z / Strg+Y', 'Rückgängig und Wiederholen, auch für mehrere Änderungen in einem Schritt'],
  ['Pfeiltasten, Enter', 'in Tabellen bewegen und öffnen; in Zellen tippen ändert sofort'],
  ['Esc', 'Fenster schließen, Eingabe abbrechen'],
  ['Rechtsklick', 'Menü zu einem Eintrag (Öffnen, Duplizieren, Löschen …)'],
];

const ARTEN: Record<FeldArt, string> = { text: 'Text', langtext: 'Text, mehrzeilig', auswahl: 'Auswahl', email: 'E-Mail', telefon: 'Telefon', zahl: 'Zahl', ja_nein: 'Ja/Nein', verweis: 'Verweis', datum: 'Datum', mehrfach: 'Mehrfachauswahl', schlagworte: 'Stichwörter' };
const s = (t: string) => t.replace(/[&<>"']/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[z]!);
const anker = (t: string) => t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-');
const absaetze = (t: string) => t.split(/\n\s*\n/).map((a) => `<p>${s(a.trim())}</p>`).join('');
const rollenTitel = (l: string[]) => (l.length ? l.map((r) => ROLLEN.find((x) => x.name === r)?.titel ?? r).join(', ') : 'nur Administrator:innen');

function felder(o: ObjektModell, stufe: Handbuchstufe): string {
  const l = o.felder.filter((f) => !f.verborgen && f.name !== 'projekt' && f.name !== 'version');
  if (!l.length) return '';
  return `<table><thead><tr><th>Feld</th><th>Art</th>${stufe === 'entwickler' ? '<th>technisch</th>' : ''}</tr></thead><tbody>${l.map((f) =>
    `<tr><td>${s(f.titel)}${f.pflicht ? ' *' : ''}</td><td>${s(f.art === 'auswahl' || f.art === 'mehrfach' ? `${ARTEN[f.art]}: ${(f.optionen ?? []).map((o) => o.titel).join(', ')}` : ARTEN[f.art])}</td>${stufe === 'entwickler' ? `<td><code>${s(o.name)}.${s(f.name)}</code></td>` : ''}</tr>`).join('')}</tbody></table>`;
}

/** Das Handbuch als HTML-Seite – druckbar (A4) und im Browser lesbar. aufbau: der Aufbau des Programms als Text (nur Entwickler:innen). */
export function handbuchHtml(module: Beipackzettel[], stufe: Handbuchstufe, e: { buero: string; version: string; erzeugt: string; aufbau?: string }): string {
  const admin = stufe !== 'anwender';
  const apps = module.map((m) => ({ m, ansichten: m.ansichten.filter((a) => admin || !a.nurAdmin) })).filter((x) => x.ansichten.length);
  const objekt = (n: string) => module.flatMap((m) => m.objekte).find((o) => o.name === n);
  const teile: string[] = [];
  teile.push(`<section><h2 id="bedienung">Bedienung – überall gleich</h2><p>Jede App ist gleich aufgebaut: oben die Kopfleiste mit Projekt, darunter die Menüleiste (Rückgängig am Anfang), links die Gliederung, in der Mitte der Inhalt, rechts die Details. Links und rechts lassen sich ausblenden. Alles wird sofort gespeichert – auch ohne Verbindung, dann geht es später zum Server.</p>
    <table><tbody>${UEBERALL.map(([t, w]) => `<tr><td><kbd>${s(t)}</kbd></td><td>${s(w)}</td></tr>`).join('')}</tbody></table>
    <p>Am Handy stehen Gliederung, Inhalt und Details nacheinander; unten die Leiste mit bis zu fünf Plätzen (in der Darstellung wählbar). Manche Apps sind dort nur zum Ansehen.</p></section>`);
  for (const { m, ansichten } of apps) {
    teile.push(`<section><h2 id="${anker(m.id)}">${s(m.name)}</h2>${absaetze(m.beschreibung)}${ansichten.map((a) => {
      const o = a.objekt ? objekt(a.objekt) : undefined;
      return `<h3 id="${anker(`${m.id}-${a.id}`)}">${s(a.titel)}${a.nurAdmin ? ' <small>(nur Administrator:innen)</small>' : ''}</h3>${a.hilfe ? absaetze(a.hilfe) : ''}${o ? felder(o, stufe) : ''}`;
    }).join('')}</section>`);
  }
  if (admin) {
    teile.push(`<section><h2 id="rollen">Rollen und Rechte</h2>${ROLLEN.map((r) => `<p><b>${s(r.titel)}</b> – ${s(r.erklaerung)}</p>`).join('')}
      <p>Was eine Rolle darf, steht in der Datenbank und lässt sich in Verwaltung → Rechte ändern. Ab Werk gilt:</p>
      <table><thead><tr><th>Bereich</th><th>Sehen</th><th>Ändern</th><th>Löschen</th></tr></thead><tbody>${module.flatMap((m) => m.objekte).map((o) =>
        `<tr><td>${s(o.titelMehrzahl)}</td><td>${s(rollenTitel(o.rechte.lesen))}</td><td>${s(rollenTitel(o.rechte.schreiben))}</td><td>${s(rollenTitel(o.rechte.loeschen))}</td></tr>`).join('')}</tbody></table></section>`);
  }
  if (stufe === 'entwickler' && e.aufbau) teile.push(`<section><h2 id="aufbau">Aufbau des Programms</h2><pre>${s(e.aufbau)}</pre></section>`);
  const inhalt = `<nav><h2>Inhalt</h2><ol><li><a href="#bedienung">Bedienung</a></li>${apps.map(({ m }) => `<li><a href="#${anker(m.id)}">${s(m.name)}</a></li>`).join('')}${admin ? '<li><a href="#rollen">Rollen und Rechte</a></li>' : ''}${stufe === 'entwickler' && e.aufbau ? '<li><a href="#aufbau">Aufbau des Programms</a></li>' : ''}</ol></nav>`;
  const titel = `Bauportal – Handbuch für ${STUFEN.find((x) => x.wert === stufe)!.titel}`;
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>${s(titel)}</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>
@page{size:A4;margin:16mm 15mm 18mm}body{font:11pt/1.5 Inter,system-ui,'Segoe UI',sans-serif;color:#1c1c1a;max-width:860px;margin:0 auto;padding:24px}
h1{font-size:22pt;margin:0 0 4px}h2{font-size:15pt;margin:28px 0 8px;border-bottom:1px solid #cfcfc8;padding-bottom:4px;break-after:avoid}h3{font-size:12pt;margin:18px 0 4px;break-after:avoid}
section{break-before:page}section:first-of-type{break-before:auto}table{border-collapse:collapse;width:100%;font-size:9.5pt;margin:6px 0 10px}td,th{border:1px solid #e2e2dc;padding:3px 6px;text-align:left;vertical-align:top}th{background:#f6f6f3}
kbd{font:9pt ui-monospace,monospace;border:1px solid #cfcfc8;border-radius:4px;padding:0 4px}pre{font:8pt/1.4 ui-monospace,monospace;white-space:pre-wrap}.unter{color:#5b5b57}nav ol{columns:2}a{color:#1d4ed8}
</style></head><body><h1>${s(titel)}</h1><p class="unter">${s(e.buero)} · Version ${s(e.version)} · erzeugt am ${s(e.erzeugt)} aus dem Programm</p>${inhalt}${teile.join('')}</body></html>`;
}
