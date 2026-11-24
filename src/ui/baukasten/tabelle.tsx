// Baustein „Tabelle“ (Platz Mitte): Spalten aus dem Datenmodell. Sortieren, Filtern je Spalte, Spalten einstellen,
// Bearbeiten direkt in der Zelle (Doppelklick oder F2), Tastatur, Kontextmenü.
// Im Dokument stehen nur die sichtbaren Zeilen – die Tabelle bleibt auch mit tausenden Einträgen schnell.
import { For, Show, createMemo, createSelector, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import { unwrap } from 'solid-js/store';
import type { Feld, ObjektModell, Wert } from '../../kern/modell';
import { HERKUNFT, type Zeile } from '../../kern/befehl';
import { Dialog } from './dialog';
import { anzeige } from './feld';
import { zeigeMenue, type Menuepunkt } from './kontextmenue';
import { spaltenFuer } from './spalten';

const vergleich = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
const ZEILENHOEHE = 37;
/** Diese Feldarten lassen sich in der Zelle schreiben; Ja/Nein schaltet der Doppelklick um. Alles andere öffnet die Karte. */
const IN_ZELLE = ['text', 'zahl', 'datum', 'email', 'telefon'];

export interface TabellenSteuer { spaltenEinstellen: () => void; fokus: () => void; ersteWaehlen: () => void }

export function Tabelle(p: {
  modell: ObjektModell;
  zeilen: Zeile[];                              // schon gefiltert; sortiert wird hier
  gewaehlt: string | null;
  onWahl: (id: string | null) => void;
  onOeffnen?: (z: Zeile) => void;               // Enter – oder Doppelklick auf eine Zelle, die sich nicht in der Tabelle bearbeiten lässt
  filter?: Record<string, string>;              // Filterzeile: Text je Spalte (gefiltert wird außerhalb – so stimmt auch der Zähler)
  onFilter?: (feld: string, text: string) => void;
  onZelle?: (z: Zeile, f: Feld, w: Wert) => string | undefined;   // Wert aus der Zelle übernehmen; liefert den Fehlertext, wenn er nicht passt
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
  const [inArbeit, setInArbeit] = createSignal<{ id: string; feld: string; fehler?: string } | null>(null);
  const kopfHoehe = () => (p.onFilter ? 71 : 35);
  let kasten!: HTMLDivElement;

  const sortiert = createMemo(() => {
    const s = sort();
    const f = m.felder.find((x) => x.name === s.feld)!;
    // ohne Abhören lesen: p.zeilen kommt bei jeder Änderung neu, das genügt als Auslöser
    const schluessel = new Map(p.zeilen.map((z) => { const r = unwrap(z); return [r.id, anzeige(f, r.werte[s.feld])]; }));
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
    const oben = sortiert().indexOf(z) * ZEILENHOEHE, kopf = kopfHoehe();
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
    else if (e.key === 'F2' && l[i]) { const f = spalten.sichtbare().find((x) => p.onZelle && IN_ZELLE.includes(x.art)); if (f) { e.preventDefault(); setInArbeit({ id: l[i].id, feld: f.name }); } }
    else if (e.key === 'Delete' && l[i] && p.onLoeschen) { e.preventDefault(); const z = l[i]; waehle(l[i + 1] ?? l[i - 1]); p.onLoeschen(z); }
    else if (e.key === 'Escape' && p.gewaehlt) { e.preventDefault(); p.onWahl(null); }
    else if (e.key === '/' && p.onSuche) { e.preventDefault(); p.onSuche(); }
  };

  // ---- Bearbeiten in der Zelle ----
  const zeigen = (f: Feld, w: Wert | undefined) => (w === null || w === undefined ? '' : typeof w === 'number' ? String(w).replace('.', ',') : String(w));
  // Der erste Klick eines Doppelklicks wählt die Zeile – dabei kann die Karte aufgehen und die Spalten rücken.
  // Gemeint ist die Zelle des ersten Klicks, deshalb wird sie gemerkt.
  let ersterKlick = { id: '', feld: '', zeit: 0 };
  const doppelklick = (z: Zeile, getroffen: Feld) => {
    const f = ersterKlick.id === z.id && performance.now() - ersterKlick.zeit < 700 ? m.felder.find((x) => x.name === ersterKlick.feld) ?? getroffen : getroffen;
    if (p.onZelle && f.art === 'ja_nein' && !p.zelle?.(f, z)) { p.onZelle(z, f, z.werte[f.name] !== true); return; }
    if (p.onZelle && IN_ZELLE.includes(f.art)) { setInArbeit({ id: z.id, feld: f.name }); return; }
    p.onOeffnen?.(z);
  };
  /** Übernimmt die Eingabe. weiter: +1/-1 = danach die nächste/vorige schreibbare Zelle der Zeile öffnen (Tab). */
  const fertig = (z: Zeile, f: Feld, feld: HTMLInputElement, weiter = 0) => {
    if (inArbeit()?.id !== z.id || inArbeit()?.feld !== f.name) return;   // schon weitergezogen (Tab) oder abgebrochen
    const fehler = feld.value === zeigen(f, z.werte[f.name]) ? undefined : p.onZelle!(z, f, feld.value);
    if (fehler) { setInArbeit({ id: z.id, feld: f.name, fehler }); feld.focus(); return; }
    const reihe = spalten.sichtbare().filter((x) => IN_ZELLE.includes(x.art));
    const naechste = weiter ? reihe[reihe.indexOf(f) + weiter] : undefined;
    setInArbeit(naechste ? { id: z.id, feld: naechste.name } : null);
    if (!naechste) kasten.focus();
  };
  const eingabeTaste = (e: KeyboardEvent, z: Zeile, f: Feld) => {
    e.stopPropagation();
    const feld = e.currentTarget as HTMLInputElement;
    if (e.key === 'Enter') { e.preventDefault(); fertig(z, f, feld); }
    else if (e.key === 'Tab') { e.preventDefault(); fertig(z, f, feld, e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); setInArbeit(null); kasten.focus(); }
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
          </tr>
          <Show when={p.onFilter}>
            <tr class="filterzeile">
              <For each={spalten.sichtbare()}>{(f) => (
                <th><input type="search" aria-label={`${f.titel} filtern`} placeholder="filtern" value={p.filter?.[f.name] ?? ''} onInput={(e) => p.onFilter!(f.name, e.currentTarget.value)}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') { p.onFilter!(f.name, ''); } else if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); kasten.focus(); if (!sortiert().some((z) => z.id === p.gewaehlt)) waehle(sortiert()[0]); } }} /></th>
              )}</For>
            </tr>
          </Show>
          </thead>
          <tbody>
            <tr aria-hidden="true" style={{ height: `${fenster().von * ZEILENHOEHE}px` }} />
            <For each={fenster().teil}>{(z) => (
              <tr classList={{ gewaehlt: istGewaehlt(z.id) }} onClick={() => p.onWahl(z.id)}
                onContextMenu={(e) => { if (!p.zeilenMenue) return; p.onWahl(z.id); zeigeMenue(e, p.zeilenMenue(z)); }}>
                <For each={spalten.sichtbare()}>{(f) => (
                  <td class={z.herkunft?.[f.name] ? `herkunft-${z.herkunft[f.name]}` : undefined} classList={{ 'in-arbeit': inArbeit()?.id === z.id && inArbeit()?.feld === f.name }}
                    title={z.herkunft?.[f.name] ? HERKUNFT[z.herkunft[f.name]!] : undefined}
                    onClick={(e) => { if (e.detail === 1) ersterKlick = { id: z.id, feld: f.name, zeit: performance.now() }; }} onDblClick={() => doppelklick(z, f)}>
                    <Show when={inArbeit()?.id === z.id && inArbeit()?.feld === f.name} fallback={p.zelle?.(f, z) ?? anzeige(f, z.werte[f.name])}>
                      <input ref={(el) => queueMicrotask(() => { el.focus(); el.select?.(); })} type={f.art === 'datum' ? 'date' : 'text'} inputMode={f.art === 'zahl' ? 'decimal' : undefined} value={zeigen(f, z.werte[f.name])}
                        aria-label={f.titel} aria-invalid={!!inArbeit()?.fehler} title={inArbeit()?.fehler} classList={{ falsch: !!inArbeit()?.fehler }}
                        onKeyDown={(e) => eingabeTaste(e, z, f)} onBlur={(e) => fertig(z, f, e.currentTarget)} onClick={(e) => e.stopPropagation()} onDblClick={(e) => e.stopPropagation()} />
                    </Show>
                  </td>
                )}</For>
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
