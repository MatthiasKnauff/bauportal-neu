// Baustein „Auswahl“: mehrere Einträge wählen – wie im bisherigen Bauportal (Adressen auswählen).
// Haken vorn an jeder Zeile oder Karte; Strg+Klick dazu/ab, Umschalt+Klick von … bis; Haken im Kopf = alle gefilterten
// (halb = einige); Strg+A alle gefilterten, Esc hebt auf; am Handy lange tippen beginnt die Auswahl, danach tippen = dazu/ab.
// Die Auswahl bleibt beim Ändern des Filters. Die Befehle stehen in einer schwebenden Leiste unten über der Liste
// (nichts schiebt die Liste) und, auf eine gewählte Zeile mit der rechten Maustaste, im Kontextmenü (höchstens 6 Punkte).
import { For, Show, createEffect, createMemo, createSignal } from 'solid-js';
import { zeigeMenue, type Menuepunkt } from './kontextmenue';

export interface Auswahl {
  ids: () => Set<string>;
  anzahl: () => number;
  hat: (id: string) => boolean;
  umschalten: (id: string) => void;
  /** Umschalt+Klick: von der zuletzt angeklickten bis zu dieser, in der gezeigten Reihenfolge. */
  bereich: (id: string, reihe: string[]) => void;
  alle: (reihe: string[], an?: boolean) => void;
  nur: (reihe: string[]) => void;
  leeren: () => void;
  anker: (id: string) => void;
}

export function auswahlAnlegen(): Auswahl {
  const [ids, setIds] = createSignal<Set<string>>(new Set());
  let anker: string | null = null;
  const setzen = (f: (s: Set<string>) => void) => { const s = new Set(ids()); f(s); setIds(s); };
  return {
    ids, anzahl: () => ids().size, hat: (id) => ids().has(id),
    umschalten: (id) => { setzen((s) => (s.has(id) ? s.delete(id) : s.add(id))); anker = id; },
    bereich: (id, reihe) => {
      const i = anker ? reihe.indexOf(anker) : -1, j = reihe.indexOf(id);
      if (i < 0 || j < 0) { setzen((s) => s.add(id)); anker = id; return; }
      setzen((s) => reihe.slice(Math.min(i, j), Math.max(i, j) + 1).forEach((x) => s.add(x)));
    },
    alle: (reihe, an) => { const ein = an ?? !reihe.every((x) => ids().has(x)); setzen((s) => reihe.forEach((x) => (ein ? s.add(x) : s.delete(x)))); },
    nur: (reihe) => { const r = new Set(reihe); setzen((s) => [...s].forEach((x) => { if (!r.has(x)) s.delete(x); })); },
    leeren: () => { setIds(new Set<string>()); anker = null; },
    anker: (id) => { anker = id; },
  };
}

/** Klick auf eine Zeile/Karte: true, wenn er der Auswahl galt (dann nicht als einfache Wahl behandeln). */
export function auswahlKlick(a: Auswahl | undefined, e: MouseEvent, id: string, reihe: () => string[]): boolean {
  if (!a) return false;
  if (e.shiftKey) { e.preventDefault(); a.bereich(id, reihe()); return true; }
  if (e.ctrlKey || e.metaKey) { e.preventDefault(); a.umschalten(id); return true; }
  if (a.anzahl() && schmal()) { a.umschalten(id); return true; }   // am Handy: ist schon etwas gewählt, wählt Tippen dazu/ab
  a.anker(id);
  return false;
}
const schmal = () => matchMedia('(max-width: 860px)').matches;

/** Lange tippen (Handy) beginnt die Auswahl. Liefert die Ereignisse für die Zeile/Karte. */
export function langTippen(a: Auswahl | undefined, id: string) {
  let uhr: ReturnType<typeof setTimeout> | undefined, x0 = 0, y0 = 0, lang = false;
  return {
    onPointerDown: (e: PointerEvent) => {
      if (!a || e.pointerType !== 'touch') return;
      x0 = e.clientX; y0 = e.clientY; lang = false;
      uhr = setTimeout(() => { lang = true; a.umschalten(id); navigator.vibrate?.(15); }, 500);
    },
    onPointerMove: (e: PointerEvent) => { if (uhr && Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) > 8) { clearTimeout(uhr); uhr = undefined; } },
    onPointerUp: () => { clearTimeout(uhr); uhr = undefined; },
    onPointerCancel: () => { clearTimeout(uhr); uhr = undefined; },
    /** der Klick nach dem langen Tippen zählt nicht */
    schlucken: (e: MouseEvent) => { if (lang) { lang = false; e.preventDefault(); e.stopPropagation(); return true; } return false; },
    onContextMenu: (e: MouseEvent) => { if (lang) e.preventDefault(); },
  };
}

/** Haken an Zeile oder Karte. */
export function Haken(p: { auswahl: Auswahl; id: string; name: string; reihe: () => string[] }) {
  return <input type="checkbox" class="auswahl-haken" checked={p.auswahl.hat(p.id)} aria-label={`${p.name} auswählen`}
    onClick={(e) => { e.stopPropagation(); if (e.shiftKey) p.auswahl.bereich(p.id, p.reihe()); else p.auswahl.umschalten(p.id); }} />;
}

/** Haken im Kopf: alle gefilterten (halb = einige). */
export function KopfHaken(p: { auswahl: Auswahl; reihe: () => string[] }) {
  const n = createMemo(() => p.reihe().filter((x) => p.auswahl.hat(x)).length);
  return <input type="checkbox" class="auswahl-haken" aria-label="Alle gefilterten auswählen" title="Alle gefilterten wählen (Strg+A)"
    checked={!!p.reihe().length && n() === p.reihe().length} ref={(el) => createEffect(() => { el.indeterminate = n() > 0 && n() < p.reihe().length; })} onClick={(e) => { e.stopPropagation(); p.auswahl.alle(p.reihe()); }} />;
}

/** Ein Befehl für die Gewählten. menue: statt sofort auszuführen klappt eine Liste auf (höchstens 6 Punkte). */
export interface AuswahlBefehl {
  titel: string;
  tun?: (ids: string[]) => void;
  menue?: (ids: string[]) => Menuepunkt[];
  gesperrt?: (ids: string[]) => string | undefined;   // Grund, warum es gerade nicht geht (steht als Hinweis am Knopf)
  gefahr?: boolean;
  nurMenue?: boolean;                                   // nicht in der Leiste, nur im Kontextmenü
}

const ausfuehren = (b: AuswahlBefehl, ids: string[], ort: { clientX: number; clientY: number }) => {
  if (b.menue) zeigeMenue({ clientX: ort.clientX, clientY: ort.clientY, preventDefault: () => undefined } as MouseEvent, b.menue(ids));
  else b.tun?.(ids);
};

/** Schwebende Leiste unten über der Liste: „n von m gewählt“, Befehle. reihe: die gerade gezeigten (gefilterten) Einträge. */
export function Auswahlleiste(p: { auswahl: Auswahl; reihe: () => string[]; befehle: AuswahlBefehl[] }) {
  const sichtbar = createMemo(() => p.reihe().filter((x) => p.auswahl.hat(x)).length);
  const ids = () => [...p.auswahl.ids()];
  return (
    <Show when={p.auswahl.anzahl()}>
      <div class="auswahlleiste" role="toolbar" aria-label="Auswahl">
        <b>{sichtbar()} von {p.reihe().length} gewählt</b>
        <Show when={p.auswahl.anzahl() > sichtbar()}>
          <span class="still-text">dazu {p.auswahl.anzahl() - sichtbar()}, die der Filter ausblendet · <button type="button" class="verweis-knopf" onClick={() => p.auswahl.nur(p.reihe())}>nur sichtbare</button></span>
        </Show>
        <Show when={sichtbar() < p.reihe().length}><button type="button" class="verweis-knopf" onClick={() => p.auswahl.alle(p.reihe(), true)}>alle wählen</button></Show>
        <button type="button" class="verweis-knopf" onClick={() => p.auswahl.leeren()}>Auswahl aufheben</button>
        <span class="auswahlleiste-platz" />
        <For each={p.befehle.filter((b) => !b.nurMenue)}>{(b) => {
          const grund = () => b.gesperrt?.(ids());
          return <button type="button" class="knopf klein" classList={{ gefahr: b.gefahr }} disabled={!!grund()} title={grund() ?? b.titel}
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); ausfuehren(b, ids(), { clientX: r.left, clientY: r.top - 8 - (b.menue ? Math.min(6, b.menue(ids()).length) * 38 : 0) }); }}>
            {b.titel}{b.menue ? ' ▾' : ''}
          </button>;
        }}</For>
      </div>
    </Show>
  );
}

/** Kontextmenü auf einer gewählten Zeile: dieselben Befehle wie die Leiste, dazu „Auswahl aufheben“ – höchstens 6. */
export function auswahlMenue(a: Auswahl, befehle: AuswahlBefehl[], e: MouseEvent): void {
  const ids = [...a.ids()];
  const punkte: Menuepunkt[] = befehle.map((b) => ({ titel: `${b.titel}${b.menue ? ' …' : ''}`, gefahr: b.gefahr, gesperrt: !!b.gesperrt?.(ids), tun: () => ausfuehren(b, ids, e) }));
  const aufheben: Menuepunkt = { titel: 'Auswahl aufheben', tun: a.leeren };
  zeigeMenue(e, punkte.length >= 6 ? [...punkte.slice(0, 5), aufheben] : [...punkte, aufheben]);
}
