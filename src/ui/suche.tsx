// Suche über alles (Strg+K): findet Einträge aller Objekte, die man sehen darf – Projekte, Kontakte, Berichte, Leistungen,
// Bauteile … – im Gerät, also auch ohne Verbindung. Ein Treffer öffnet die passende Ansicht mit dem Eintrag in der Karte.
import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { unwrap } from 'solid-js/store';
import type { Beipackzettel } from '../kern/modul';
import type { ObjektModell } from '../kern/modell';
import { objektname, sicht } from './unterbau/abgleich';
import { darf, zustand } from './unterbau/api';
import { anzeige } from './baukasten/feld';
import { Dialog } from './baukasten/dialog';

/** Seite einer App (auch Einstellungen): aus dem Beipackzettel – Titel, Abschnitt, Hilfe; bei Einstellungsobjekten die Felder. */
export interface Seite { modul: string; ansicht: string; titel: string; unter: string; worte: string; stelle?: string }

export interface Treffer { modul: Beipackzettel; ansicht: string; m: ObjektModell; id: string; titel: string; unter: string; projekt: string | null; version: string | null }

export function Suche(p: { onTreffer: (t: Treffer) => void; onZu: () => void; seiten: Seite[]; onSeite: (s: Seite) => void }) {
  const [text, setText] = createSignal('');
  const [zeiger, setZeiger] = createSignal(0);
  let feld!: HTMLInputElement;
  onMount(() => feld.focus());
  // Wo jedes Objekt zu sehen ist: die erste Ansicht eines Moduls, die es zeigt
  const orte = createMemo(() => {
    const o = new Map<string, { modul: Beipackzettel; ansicht: string; m: ObjektModell }>();
    for (const modul of zustand()!.module) for (const a of modul.ansichten) if (a.objekt && !o.has(a.objekt) && !a.nurAdmin) {
      const m = modul.objekte.find((x) => x.name === a.objekt) ?? zustand()!.module.flatMap((x) => x.objekte).find((x) => x.name === a.objekt);
      if (m && darf(m.name, 'lesen')) o.set(a.objekt, { modul, ansicht: a.id, m });
    }
    return o;
  });
  const treffer = createMemo((): Treffer[] => {
    const worte = text().toLowerCase().split(/\s+/).filter(Boolean);
    if (!worte.length || worte.join('').length < 2) return [];
    const out: Treffer[] = [];
    for (const [objekt, o] of orte()) {
      const textfelder = o.m.felder.filter((f) => !f.verborgen && (f.art === 'text' || f.art === 'langtext' || f.art === 'email' || f.art === 'telefon' || f.art === 'auswahl' || f.art === 'datum'));
      for (const z of Object.values(sicht[objekt] ?? {})) {
        const r = unwrap(z);
        if (r.geloescht) continue;
        const hay = textfelder.map((f) => anzeige(f, r.werte[f.name])).join(' ').toLowerCase();
        if (!worte.every((w) => hay.includes(w))) continue;
        const projekt = o.m.projektFeld && o.m.projektFeld !== 'id' ? (r.werte[o.m.projektFeld] as string | null) : o.m.name === 'projekt' ? r.id : null;
        const pname = projekt && o.m.name !== 'projekt' ? String(sicht.projekt?.[projekt]?.werte.name ?? '') : '';
        out.push({ ...o, id: r.id, titel: objektname(o.m, r.werte) || o.m.titel, unter: [o.m.titel, pname].filter(Boolean).join(' · '), projekt, version: (r.werte.version as string | null) ?? null });
        if (out.length >= 60) return out;
      }
    }
    return out;
  });
  // Seiten und Einstellungen zuerst (wie das Stichwortverzeichnis im bisherigen Bauportal) – höchstens acht
  const seiten = createMemo((): Seite[] => {
    const worte = text().toLowerCase().split(/\s+/).filter(Boolean);
    if (!worte.length || worte.join('').length < 2) return [];
    return p.seiten.filter((x) => worte.every((w) => x.worte.includes(w))).slice(0, 8);
  });
  const alle = createMemo((): { seite?: Seite; t?: Treffer }[] => [...seiten().map((x) => ({ seite: x })), ...treffer().map((t) => ({ t }))]);
  const waehlen = (x?: { seite?: Seite; t?: Treffer }) => { if (x?.seite) { p.onSeite(x.seite); p.onZu(); } else if (x?.t) { p.onTreffer(x.t); p.onZu(); } };
  return (
    <Dialog titel="Suche über alles" onAbbrechen={p.onZu} knoepfe={<button class="knopf" onClick={p.onZu}>Schließen</button>}>
      <input ref={feld} class="suche suche-alles" type="search" placeholder="Projekt, Firma, Bericht, Leistung, Einstellung …" value={text()} aria-label="Suchen in allen Apps"
        onInput={(e) => { setText(e.currentTarget.value); setZeiger(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setZeiger(Math.min(alle().length - 1, zeiger() + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setZeiger(Math.max(0, zeiger() - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); waehlen(alle()[zeiger()]); }
        }} />
      <Show when={text().trim().length >= 2} fallback={<p class="still-text klein-text">Gesucht wird in allem, was du sehen darfst – auch ohne Verbindung. Pfeiltasten und Enter öffnen den Treffer.</p>}>
        <ul class="suche-treffer" role="listbox">
          <For each={alle()} fallback={<li class="still-text">Nichts gefunden.</li>}>{(x, i) => (
            <li role="option" aria-selected={i() === zeiger()} classList={{ an: i() === zeiger(), seite: !!x.seite }} onMouseEnter={() => setZeiger(i())} onClick={() => waehlen(x)}>
              <strong>{x.seite?.titel ?? x.t!.titel}</strong><span class="still-text klein-text">{x.seite ? x.seite.unter : x.t!.unter}</span>
            </li>
          )}</For>
        </ul>
      </Show>
    </Dialog>
  );
}
