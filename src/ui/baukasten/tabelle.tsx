// Baustein „Tabelle“ (Platz Mitte): Spalten aus dem Datenmodell. Sortieren, Spalten einstellen, Tastatur, Kontextmenü.
// Im Dokument stehen nur die sichtbaren Zeilen – die Tabelle bleibt auch mit tausenden Einträgen schnell.
import { For, Show, createMemo, createSelector, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import type { Feld, ObjektModell } from '../../kern/modell';
import type { Zeile } from '../../kern/befehl';
import { Dialog } from './dialog';
import { anzeige } from './feld';
import { zeigeMenue, type Menuepunkt } from './kontextmenue';
import { spaltenFuer } from './spalten';

const vergleich = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
const ZEILENHOEHE = 37;

export interface TabellenSteuer { spaltenEinstellen: () => void; fokus: () => void; ersteWaehlen: () => void }

export function Tabelle(p: {
  modell: ObjektModell;
  zeilen: Zeile[];                              // schon gefiltert; sortiert wird hier
  gewaehlt: string | null;
  onWahl: (id: string | null) => void;
  onOeffnen?: (z: Zeile) => void;               // Enter oder Doppelklick
  onLoeschen?: (z: Zeile) => void;              // Entf
  onSuche?: () => void;                         // Taste /
  zeilenMenue?: (z: Zeile) => Menuepunkt[];
  zelle?: (f: Feld, z: Zeile) => JSX.Element | undefined;
  leer: string;
  fuss?: JSX.Element;                           // z. B. Summenzeile
  steuer?: (s: TabellenSteuer) => void;
}) {
  const m = p.modell;
  const spalten = spaltenFuer(m);
  const [sort, setSort] = createSignal<{ feld: string; ab: boolean }>({ feld: m.anzeigeFeld, ab: false });
  const [spaltenFenster, setSpaltenFenster] = createSignal(false);
  const [rollen, setRollen] = createSignal({ oben: 0, hoehe: 600 });
  const istGewaehlt = createSelector(() => p.gewaehlt);
  let kasten!: HTMLDivElement;

  const sortiert = createMemo(() => {
    const s = sort();
    const f = m.felder.find((x) => x.name === s.feld)!;
    const schluessel = new Map(p.zeilen.map((z) => [z.id, anzeige(f, z.werte[s.feld])]));
    return [...p.zeilen].sort((a, b) => vergleich.compare(schluessel.get(a.id)!, schluessel.get(b.id)!) * (s.ab ? -1 : 1));
  });
  const fenster = createMemo(() => {
    const von = Math.max(0, Math.floor(rollen().oben / ZEILENHOEHE) - 8);
    const bis = Math.min(sortiert().length, Math.ceil((rollen().oben + rollen().hoehe) / ZEILENHOEHE) + 8);
    return { von, bis, teil: sortiert().slice(von, bis) };
  });
  const breite = createMemo(() => spalten.sichtbare().reduce((s, f) => s + spalten.breite(f), 0));

  const waehle = (z: Zeile | undefined) => {
    if (!z) return;
    p.onWahl(z.id);
    const oben = sortiert().indexOf(z) * ZEILENHOEHE, kopf = 35;
    if (oben < kasten.scrollTop) kasten.scrollTop = oben;
    else if (oben + ZEILENHOEHE + kopf > kasten.scrollTop + kasten.clientHeight) kasten.scrollTop = oben + ZEILENHOEHE + kopf - kasten.clientHeight;
  };
  onMount(() => {
    const b = new ResizeObserver(() => setRollen((r) => ({ ...r, hoehe: kasten.clientHeight })));
    b.observe(kasten);
    onCleanup(() => b.disconnect());
    p.steuer?.({
      spaltenEinstellen: () => setSpaltenFenster(true),
      fokus: () => kasten.focus(),
      ersteWaehlen: () => { kasten.scrollTop = 0; if (!sortiert().some((z) => z.id === p.gewaehlt)) waehle(sortiert()[0]); },
    });
  });

  const tasten = (e: KeyboardEvent) => {
    const l = sortiert();
    const i = l.findIndex((z) => z.id === p.gewaehlt);
    const seite = Math.max(1, Math.floor(kasten.clientHeight / ZEILENHOEHE) - 2);
    const schritt: Record<string, number> = { ArrowDown: i + 1, ArrowUp: i - 1, PageDown: i + seite, PageUp: i - seite, Home: 0, End: l.length - 1 };
    if (e.key in schritt) { e.preventDefault(); waehle(l[Math.max(0, Math.min(l.length - 1, schritt[e.key]!))]); }
    else if (e.key === 'Enter' && l[i] && p.onOeffnen) { e.preventDefault(); p.onOeffnen(l[i]); }
    else if (e.key === 'Delete' && l[i] && p.onLoeschen) { e.preventDefault(); const z = l[i]; waehle(l[i + 1] ?? l[i - 1]); p.onLoeschen(z); }
    else if (e.key === 'Escape' && p.gewaehlt) { e.preventDefault(); p.onWahl(null); }
    else if (e.key === '/' && p.onSuche) { e.preventDefault(); p.onSuche(); }
  };

  let gezogen = '';
  const breiteZiehen = (e: PointerEvent, f: Feld) => {
    e.preventDefault(); e.stopPropagation();
    const start = e.clientX, b0 = spalten.breite(f);
    const bewegt = (x: PointerEvent) => spalten.setzeBreite(f.name, b0 + x.clientX - start, false);
    const fertig = (x: PointerEvent) => { spalten.setzeBreite(f.name, b0 + x.clientX - start, true); removeEventListener('pointermove', bewegt); removeEventListener('pointerup', fertig); };
    addEventListener('pointermove', bewegt); addEventListener('pointerup', fertig);
  };

  return (
    <>
      <div class="tabelle-rollen" tabindex="0" ref={kasten} onKeyDown={tasten} onScroll={() => setRollen({ oben: kasten.scrollTop, hoehe: kasten.clientHeight })}>
        <table class="tabelle" style={{ width: `${breite()}px` }}>
          <colgroup><For each={spalten.sichtbare()}>{(f) => <col style={{ width: `${spalten.breite(f)}px` }} />}</For></colgroup>
          <thead><tr onContextMenu={(e) => zeigeMenue(e, [{ titel: 'Spalten einstellen …', tun: () => setSpaltenFenster(true) }, { titel: 'Spalten zurücksetzen', tun: spalten.zuruecksetzen }])}>
            <For each={spalten.sichtbare()}>{(f) => (
              <th aria-sort={sort().feld === f.name ? (sort().ab ? 'descending' : 'ascending') : 'none'} draggable={true}
                onDragStart={(e) => { gezogen = f.name; e.dataTransfer!.effectAllowed = 'move'; }} onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (gezogen) spalten.schieben(gezogen, f.name); gezogen = ''; }}>
                <button onClick={() => setSort((s) => ({ feld: f.name, ab: s.feld === f.name ? !s.ab : false }))}>
                  <span>{f.titel}</span><span class="pfeil">{sort().feld === f.name ? (sort().ab ? '▼' : '▲') : ''}</span>
                </button>
                <i class="griff" aria-hidden="true" onPointerDown={(e) => breiteZiehen(e, f)} onClick={(e) => e.stopPropagation()} />
              </th>
            )}</For>
          </tr></thead>
          <tbody>
            <tr aria-hidden="true" style={{ height: `${fenster().von * ZEILENHOEHE}px` }} />
            <For each={fenster().teil}>{(z) => (
              <tr classList={{ gewaehlt: istGewaehlt(z.id) }} onClick={() => p.onWahl(z.id)} onDblClick={() => p.onOeffnen?.(z)}
                onContextMenu={(e) => { if (!p.zeilenMenue) return; p.onWahl(z.id); zeigeMenue(e, p.zeilenMenue(z)); }}>
                <For each={spalten.sichtbare()}>{(f) => <td>{p.zelle?.(f, z) ?? anzeige(f, z.werte[f.name])}</td>}</For>
              </tr>
            )}</For>
            <tr aria-hidden="true" style={{ height: `${(sortiert().length - fenster().bis) * ZEILENHOEHE}px` }} />
          </tbody>
          <Show when={p.fuss}><tfoot>{p.fuss}</tfoot></Show>
        </table>
        <Show when={!sortiert().length}><div class="leer">{p.leer}</div></Show>
      </div>
      <Show when={spaltenFenster()}>
        <Dialog titel={`Spalten – ${m.titelMehrzahl}`} onAbbrechen={() => setSpaltenFenster(false)}
          knoepfe={<><button class="knopf" onClick={spalten.zuruecksetzen}>Zurücksetzen</button><button class="knopf haupt" onClick={() => setSpaltenFenster(false)}>Fertig</button></>}>
          <p class="still-text klein-text">Gilt für dich auf diesem Gerät. In der Tabelle kannst du Spalten auch am Kopf ziehen und am rechten Rand breiter machen.</p>
          <ul class="schaltliste">
            <For each={spalten.alle()}>{(f, i) => (
              <li>
                <span><strong>{f.titel}</strong></span>
                <span class="reihe-knoepfe">
                  <button class="knopf klein still" aria-label={`${f.titel} nach oben`} disabled={i() === 0} onClick={() => spalten.schritt(f.name, -1)}>▲</button>
                  <button class="knopf klein still" aria-label={`${f.titel} nach unten`} disabled={i() === spalten.alle().length - 1} onClick={() => spalten.schritt(f.name, 1)}>▼</button>
                  <button type="button" role="switch" aria-checked={spalten.istAn(f.name)} aria-label={`Spalte ${f.titel} zeigen`} class="schalter" classList={{ aktiv: spalten.istAn(f.name) }} onClick={() => spalten.schalten(f.name)}><span /></button>
                </span>
              </li>
            )}</For>
          </ul>
        </Dialog>
      </Show>
    </>
  );
}
