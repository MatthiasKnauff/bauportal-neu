// Baustein „Auswahlliste“: eigene Liste statt der Auswahl des Browsers – mit Suche und Tastatur.
// Die aufgeklappte Liste liegt über allem (am Seitenende eingehängt, fest positioniert): In einem Fenster oder einer Karte,
// die selbst rollt, würde sie sonst abgeschnitten. Reicht der Platz unter dem Knopf nicht, klappt sie nach oben auf.
import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';

export interface Option { wert: string; titel: string; anzahl?: number }   // anzahl: rechts neben dem Titel (z. B. Treffer eines Filterwerts)

/** Stellschraube „neu“: Steht das Gesuchte nicht in der Liste, bietet die Liste „＋ „…“ neu anlegen“ an (z. B. eine neue Firma) – mit dem getippten Text. */
/** Stellschraube „gewaehlt“: mehrere Werte sind gewählt (z. B. Filter) – sie sind in der Liste markiert, der Knopf zeigt den Platzhalter. */
export function Auswahlliste(p: { id?: string; optionen: Option[]; wert: string | null; onWert: (w: string) => void; gesperrt?: boolean; titel: string; platzhalter?: string; neu?: { titel: string; tun: (text: string) => void }; gewaehlt?: (w: string) => boolean;
  /** Aussehen des Knopfs: wie ein Feld (Vorgabe), als Überschrift (z. B. das LV oben im Kopf), als Kapsel mit Vorsatz (z. B. „Stand: Entwurf“) oder als Chip (Filter) */
  aussehen?: 'feld' | 'titel' | 'kapsel' | 'chip'; vorsatz?: string;
  /** als Chip: hervorgehoben, wenn schon etwas gewählt ist (z. B. ein Filter) */
  aktiv?: boolean;
  /** Zahl vorn im Knopf (z. B. wie viele Versionen es gibt) */
  zahl?: number;
  /** Befehle unter der Liste, abgesetzt (z. B. „＋ Neue Version …“, „Umbenennen …“) */
  aktionen?: { titel: string; tun: () => void; gesperrt?: boolean; gefahr?: boolean; hilfe?: string }[];
  /** Rechtsklick auf einen Eintrag (oder auf den Knopf: der gewählte) – z. B. ein Kontextmenü mit Befehlen zu diesem Eintrag */
  kontext?: (e: MouseEvent, wert: string) => void }) {
  const [offen, setOffen] = createSignal(false);
  const [suche, setSuche] = createSignal('');
  const [zeiger, setZeiger] = createSignal(0);
  let wurzel!: HTMLDivElement;
  let fenster: HTMLDivElement | undefined;
  const [lage, setLage] = createSignal<{ links: number; breite: number; oben?: number; unten?: number; hoehe: number }>({ links: 0, breite: 0, hoehe: 300 });
  const messen = () => {
    const r = wurzel.getBoundingClientRect(), unten = innerHeight - r.bottom - 8, oben = r.top - 8;
    const nachOben = unten < 220 && oben > unten;
    setLage({ links: r.left, breite: Math.max(r.width, 220), hoehe: Math.min(360, nachOben ? oben : unten), ...(nachOben ? { unten: innerHeight - r.top + 4 } : { oben: r.bottom + 4 }) });
  };
  const treffer = createMemo(() => { const s = suche().toLowerCase(); return s ? p.optionen.filter((o) => o.titel.toLowerCase().includes(s)) : p.optionen; });
  const neuText = () => { const t = suche().trim(); return p.neu && t && !p.optionen.some((o) => o.titel.toLowerCase() === t.toLowerCase()) ? t : ''; };
  const aktuell = () => p.optionen.find((o) => o.wert === p.wert)?.titel ?? '';
  const draussen = (e: MouseEvent) => { if (!wurzel.contains(e.target as Node) && !fenster?.contains(e.target as Node)) zu(); };
  // Rollt etwas außerhalb der Liste (Fenster, Seite), wandert sie mit ihrem Knopf mit; ist der Knopf nicht mehr zu sehen, schließt sie
  const gerollt = (e: Event) => {
    if (fenster?.contains(e.target as Node)) return;
    const r = wurzel.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) zu(); else messen();
  };
  const auf = () => {
    if (p.gesperrt) return;
    setSuche(''); setZeiger(Math.max(0, p.optionen.findIndex((o) => o.wert === p.wert))); messen(); setOffen(true);
    document.addEventListener('mousedown', draussen); document.addEventListener('scroll', gerollt, true); addEventListener('resize', zu);
    queueMicrotask(() => { (fenster?.querySelector('input') ?? fenster?.querySelector<HTMLElement>('[role=listbox]'))?.focus(); fenster?.querySelector('.gewaehlt')?.scrollIntoView({ block: 'nearest' }); });
  };
  const weg = () => { document.removeEventListener('mousedown', draussen); document.removeEventListener('scroll', gerollt, true); removeEventListener('resize', zu); };
  const zu = () => { setOffen(false); weg(); };
  onCleanup(weg);
  const nimm = (o: Option | undefined) => { if (!o) return; zu(); if (o.wert !== p.wert) p.onWert(o.wert); wurzel.querySelector<HTMLElement>('.auswahlliste-knopf')?.focus(); };
  const neuNehmen = () => { const t = neuText(); zu(); p.neu!.tun(t); };
  const taste = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setZeiger((z) => Math.min(treffer().length - 1, z + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setZeiger((z) => Math.max(0, z - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (treffer().length) nimm(treffer()[zeiger()]); else if (neuText()) neuNehmen(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); zu(); }
    else return;
    fenster?.querySelector('.zeiger')?.scrollIntoView({ block: 'nearest' });
  };
  return (
    <div class={`auswahlliste ${p.aussehen && p.aussehen !== 'feld' ? `als-${p.aussehen}` : ''}`} classList={{ aktiv: !!p.aktiv }} ref={wurzel}>
      <button type="button" id={p.id} class="auswahlliste-knopf" aria-label={p.id ? undefined : `${p.titel}: ${aktuell() || 'keine Auswahl'}`} aria-haspopup="listbox" aria-expanded={offen()} disabled={p.gesperrt}
        onClick={() => (offen() ? zu() : auf())} onKeyDown={(e) => { if (e.key === 'ArrowDown' && !offen()) { e.preventDefault(); auf(); } }}
        onContextMenu={(e) => { if (p.kontext && p.wert) { e.preventDefault(); p.kontext(e, p.wert); } }}>
        <Show when={p.zahl !== undefined}><span class="auswahlliste-zahl">{p.zahl}</span></Show><Show when={p.vorsatz}><small class="auswahlliste-vorsatz">{p.vorsatz}</small></Show><span classList={{ platzhalter: !aktuell() }}>{aktuell() || p.platzhalter || ''}</span><i>▾</i>
      </button>
      <Show when={offen()}>
        <Portal>
        <div class="auswahlliste-fenster schwebt" ref={fenster} onKeyDown={taste}
          style={{ left: `${lage().links}px`, width: `${lage().breite}px`, ...(lage().oben !== undefined ? { top: `${lage().oben}px` } : { bottom: `${lage().unten}px` }), '--liste-hoehe': `${lage().hoehe - (p.optionen.length > 8 || p.neu ? 52 : 12)}px` }}>
          <Show when={p.optionen.length > 8 || p.neu}>
            <input type="search" placeholder="Suchen" aria-label={`${p.titel} suchen`} value={suche()} onInput={(e) => { setSuche(e.currentTarget.value); setZeiger(0); }} />
          </Show>
          <div role="listbox" tabindex="-1" aria-label={p.titel}>
            <For each={treffer()}>{(o, i) => (
              <div role="option" aria-selected={o.wert === p.wert || !!p.gewaehlt?.(o.wert)} classList={{ zeiger: zeiger() === i(), gewaehlt: o.wert === p.wert || !!p.gewaehlt?.(o.wert) }}
                onMouseEnter={() => setZeiger(i())} onClick={() => nimm(o)} onContextMenu={(e) => { if (p.kontext) { e.preventDefault(); zu(); p.kontext(e, o.wert); } }}>{o.titel}<Show when={o.anzahl !== undefined}><span class="auswahlliste-anzahl">{o.anzahl}</span></Show></div>
            )}</For>
            <Show when={neuText()}><div role="option" aria-selected="false" class="auswahlliste-neu" onClick={neuNehmen}>＋ „{neuText()}“ {p.neu!.titel}</div></Show>
            <Show when={!treffer().length && !neuText()}><div class="auswahlliste-leer">Kein Treffer</div></Show>
          </div>
          <Show when={p.aktionen?.length}>
            <div class="auswahlliste-aktionen" role="group" aria-label="Befehle">
              <For each={p.aktionen}>{(a) => <button type="button" classList={{ 'gefahr-text': !!a.gefahr }} disabled={a.gesperrt} title={a.hilfe} onClick={() => { zu(); a.tun(); }}>{a.titel}</button>}</For>
            </div>
          </Show>
        </div>
        </Portal>
      </Show>
    </div>
  );
}
