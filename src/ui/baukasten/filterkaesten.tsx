// Baustein „Filterkästen“ und „Filtersuche“ – die Filterbedingung wie im bisherigen Bauportal sichtbar und bedienbar.
// Filterkästen (links über den Abschnitten): je Art ein farbiger Kasten mit ihren Werten. Ein Klick auf das Wort zwischen
// den Werten oder zwischen den Kästen tauscht UND ↔ ODER, ein Klick auf einen Wert dreht ihn zu NICHT, ✕ entfernt Wert
// oder Kasten; darunter die ganze Bedingung als Satz.
// Filtersuche (oben im Suchfeld): beim Tippen Vorschläge nach Art aus den Daten selbst, mit Anzahl; ein Vorschlag wird
// Filter, „-wort“ schlägt NICHT vor, freier Text bleibt Volltextsuche.
import { For, Show, createMemo, createSignal } from 'solid-js';
import { nichtWechseln, opWechseln, satz, wertWeg, gruppeWeg, wort, zwischenWechseln, type Bedingung } from '../../kern/filterbedingung';

export interface FilterArt { key: string; titel: string; werte: (id: string) => string[]; wertTitel?: (w: string) => string; vorschlagen?: boolean }   // vorschlagen: false – nicht im Suchfeld (eine andere Art zeigt dieselben Werte schon)

const FARBEN = ['#3b6fd8', '#2e9b57', '#8a5cc9', '#d9822b', '#c94a4a', '#22918f', '#b8902a', '#5a6b7d'];
const farbe = (arten: FilterArt[], key: string) => FARBEN[Math.max(0, arten.findIndex((a) => a.key === key)) % FARBEN.length];

export function Filterkaesten(p: { bedingung: Bedingung; arten: FilterArt[]; onAendern: (b: Bedingung) => void }) {
  const art = (key: string) => p.arten.find((a) => a.key === key);
  const titel = (key: string, w: string) => art(key)?.wertTitel?.(w) ?? w;
  return (
    <Show when={p.bedingung.gruppen.length}>
      <div class="filterkaesten" aria-label="Filter">
        <For each={p.bedingung.gruppen}>{(g, i) => (<>
          <Show when={i() > 0}>
            <button type="button" class="filter-op filter-zwischen" title="Verknüpfung der Filter – Klick: UND ↔ ODER" onClick={() => p.onAendern(zwischenWechseln(p.bedingung, i() - 1))}>{wort(p.bedingung.zwischen[i() - 1] ?? 'und')}</button>
          </Show>
          <div class="filterkasten" style={{ '--f': farbe(p.arten, g.art) }}>
            <div class="filterkasten-kopf"><span>{art(g.art)?.titel ?? g.art}</span>
              <button type="button" class="filter-x" title={`Filter „${art(g.art)?.titel ?? g.art}“ entfernen`} aria-label={`Filter ${art(g.art)?.titel ?? g.art} entfernen`} onClick={() => p.onAendern(gruppeWeg(p.bedingung, i()))}>✕</button>
            </div>
            <div class="filterkasten-werte">
              <For each={g.werte}>{(v, k) => (<>
                <Show when={k() > 0}><button type="button" class="filter-op" title="Verknüpfung innerhalb – Klick: ODER ↔ UND" onClick={() => p.onAendern(opWechseln(p.bedingung, i()))}>{wort(g.op)}</button></Show>
                <span class="filterwert" classList={{ nicht: v.nicht }}>
                  <button type="button" class="filterwert-text" aria-pressed={v.nicht} title={v.nicht ? 'NICHT – Klick: wieder einschließen' : 'Klick: NICHT (ausschließen)'} onClick={() => p.onAendern(nichtWechseln(p.bedingung, i(), k()))}>
                    {v.nicht ? 'nicht ' : ''}{v.enthaelt ? `enthält „${v.w}“` : titel(g.art, v.w)}
                  </button>
                  <button type="button" class="filter-x" aria-label={`${titel(g.art, v.w)} aus dem Filter nehmen`} title="Aus dem Filter nehmen" onClick={() => p.onAendern(wertWeg(p.bedingung, i(), k()))}>✕</button>
                </span>
              </>)}</For>
            </div>
          </div>
        </>)}</For>
        <p class="filtersatz">{satz(p.bedingung, (k) => art(k)?.titel ?? k, titel)}</p>
      </div>
    </Show>
  );
}

const klein = (s: string) => s.toLocaleLowerCase('de');
type Vorschlag = { art: FilterArt; w: string; n: number } | { text: true };

/** Suchfeld mit Vorschlägen nach Art. ids: die Einträge, aus denen die Vorschläge kommen. */
export function Filtersuche(p: {
  text: string; onText: (t: string) => void; arten: FilterArt[]; ids: () => string[];
  onNehmen: (art: string, w: string, nicht: boolean) => void; onWeiter: () => void; platzhalter: string; ref?: (el: HTMLInputElement) => void; name?: string;
}) {
  const [offen, setOffen] = createSignal(false);
  const [markiert, setMarkiert] = createSignal(-1);
  // Je Art einmal je Datenstand: welche Werte es gibt, wie oft, und ihr Titel klein geschrieben – beim Tippen wird nur noch darin
  // gesucht (vorher bei jedem Tastendruck alle Einträge mal alle Arten: bei 2000 Adressen über 100 ms).
  const verzeichnis = createMemo(() => {
    if (!offen()) return [];
    const ids = p.ids();
    return p.arten.filter((art) => art.vorschlagen !== false).map((art) => {
      const z = new Map<string, number>();
      for (const id of ids) for (const w of new Set(art.werte(id))) if (w) z.set(w, (z.get(w) ?? 0) + 1);
      return { art, werte: [...z].map(([w, n]) => ({ w, n, t: klein(art.wertTitel?.(w) ?? w) })) };
    });
  });
  const liste = createMemo((): { art: FilterArt; l: [string, number][] }[] => {
    const roh = p.text.trim(), q = klein(roh.startsWith('-') ? roh.slice(1) : roh);
    if (!offen() || !q) return [];
    return verzeichnis().map(({ art, werte }) => ({ art, l: werte.filter((x) => x.t.includes(q))
      .sort((x, y) => Number(!x.t.startsWith(q)) - Number(!y.t.startsWith(q)) || y.n - x.n).slice(0, 6).map((x): [string, number] => [x.w, x.n]) }))
      .filter((x) => x.l.length);
  });
  const flach = createMemo((): Vorschlag[] => [...liste().flatMap((x) => x.l.map(([w, n]) => ({ art: x.art, w, n }))), ...(liste().length ? [{ text: true as const }] : [])]);
  const nicht = () => p.text.trim().startsWith('-');
  const nimm = (v: Vorschlag | undefined) => {
    if (!v) return;
    setOffen(false); setMarkiert(-1);
    if ('text' in v) return;
    p.onNehmen(v.art.key, v.w, nicht()); p.onText('');
  };
  return (
    <div class="filtersuche">
      <input ref={p.ref} class="suche" type="search" placeholder={p.platzhalter} aria-label={p.name ?? 'Suchen und filtern'} value={p.text} autocomplete="off" role="combobox" aria-expanded={offen() && flach().length > 0}
        onInput={(e) => { p.onText(e.currentTarget.value); setOffen(true); setMarkiert(-1); }} onFocus={() => setOffen(true)} onBlur={() => setTimeout(() => setOffen(false), 150)}
        onKeyDown={(e) => {
          const l = flach();
          if (e.key === 'Escape') { if (offen() && l.length) { e.preventDefault(); setOffen(false); } }
          else if (e.key === 'ArrowDown' && offen() && l.length && markiert() < l.length - 1) { e.preventDefault(); setMarkiert(markiert() + 1); }
          else if (e.key === 'ArrowUp' && offen() && markiert() >= 0) { e.preventDefault(); setMarkiert(markiert() - 1); }
          else if (e.key === 'Enter' && offen() && markiert() >= 0) { e.preventDefault(); nimm(l[markiert()]); }
          else if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); setOffen(false); p.onWeiter(); }
        }} />
      <Show when={offen() && flach().length > 0}>
        <div class="filter-vorschlaege filtersuche-liste" role="listbox" aria-label="Vorschläge">
          <For each={liste()}>{(x) => (<>
            <h5 style={{ '--f': farbe(p.arten, x.art.key) }}><i />{x.art.titel}</h5>
            <For each={x.l}>{([w, n]) => { const i = flach().findIndex((v) => !('text' in v) && v.art === x.art && v.w === w); return (
              <div role="option" aria-selected={markiert() === i} classList={{ markiert: markiert() === i }} onMouseDown={(e) => { e.preventDefault(); nimm(flach()[i]); }}>
                <span>{nicht() ? <b class="feld-fehler">NICHT </b> : ''}{x.art.wertTitel?.(w) ?? w}</span><span class="anzahl">{n}</span>
              </div>); }}</For>
          </>)}</For>
          <h5><i />Text</h5>
          <div role="option" aria-selected={markiert() === flach().length - 1} classList={{ markiert: markiert() === flach().length - 1 }} onMouseDown={(e) => { e.preventDefault(); nimm({ text: true }); }}>
            <span>„{p.text.trim()}“ im Text suchen</span><span class="anzahl">Enter</span>
          </div>
        </div>
      </Show>
    </div>
  );
}
