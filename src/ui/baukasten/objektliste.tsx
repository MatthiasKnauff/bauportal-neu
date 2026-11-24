// Baustein „Liste mit Detailkarte“: Tabelle links, Karte rechts – beides erzeugt aus dem Datenmodell.
// Jedes Modul, das Objekte verwaltet, benutzt diesen einen Baustein. Was die Tabelle hier kann
// (Spalten, Tastatur, Kontextmenü, Karte zuklappen oder in ein eigenes Fenster legen), kann sie überall.
import { For, Show, createMemo, createSelector, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import { createStore } from 'solid-js/store';
import { Eingabefehler, leerwert, pruefeWerte, type Feld, type ObjektModell, type Wert, type Werte } from '../../kern/modell';
import type { Zeile } from '../../kern/befehl';
import { ausfuehren, rueckgaengig, sicht } from '../abgleich';
import { darf, neueKennung } from '../api';
import { Dialog } from './dialog';
import { FeldEingabe, anzeige } from './feld';
import { hinweis } from './hinweise';
import { zeigeMenue } from './kontextmenue';
import { spaltenFuer } from './spalten';

const vergleich = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
const ZEILENHOEHE = 37;

function gruppen(m: ObjektModell): { titel: string; felder: Feld[] }[] {
  const aus: { titel: string; felder: Feld[] }[] = [];
  for (const f of m.felder) {
    const t = f.gruppe ?? '';
    let g = aus.find((x) => x.titel === t);
    if (!g) aus.push((g = { titel: t, felder: [] }));
    g.felder.push(f);
  }
  return aus;
}

export function loesche(m: ObjektModell, z: Zeile): void {
  const name = String(z.werte[m.anzeigeFeld] ?? '');
  ausfuehren({ objekt: m.name, art: 'loeschen', objektId: z.id }, `„${name}“ löschen`);
  hinweis(`„${name}“ gelöscht.`, { aktion: { titel: 'Rückgängig', tun: rueckgaengig } });
}

export function inEigenemFenster(m: ObjektModell, id: string): void {
  window.open(`${location.pathname}?karte=${m.name}:${id}`, `bp-${id}`, 'popup,width=480,height=820');
}

export function ObjektListe(p: { modell: ObjektModell; kartenZusatz?: (z: Zeile) => JSX.Element }) {
  const m = p.modell;
  const spalten = spaltenFuer(m);
  const [suche, setSuche] = createSignal('');
  const [sort, setSort] = createSignal<{ feld: string; ab: boolean }>({ feld: m.anzeigeFeld, ab: false });
  const [gewaehlt, setGewaehlt] = createSignal<string | null>(null);
  const istGewaehlt = createSelector(gewaehlt);
  const [neu, setNeu] = createSignal<Werte | null>(null);
  const [spaltenFenster, setSpaltenFenster] = createSignal(false);
  const [zugeklappt, setZugeklappt] = createSignal(false);
  const [rollen, setRollen] = createSignal({ oben: 0, hoehe: 600 });
  let kasten!: HTMLDivElement;
  let suchfeld!: HTMLInputElement;
  let wurzel!: HTMLDivElement;

  const lebend = createMemo(() => Object.values(sicht[m.name] ?? {}).filter((z) => !z.geloescht));
  const zeilen = createMemo(() => {
    const worte = suche().toLowerCase().split(/\s+/).filter(Boolean);
    const treffer = worte.length
      ? lebend().filter((z) => { const t = m.felder.map((f) => anzeige(f, z.werte[f.name])).join(' ').toLowerCase(); return worte.every((w) => t.includes(w)); })
      : [...lebend()];
    const s = sort();
    const f = m.felder.find((x) => x.name === s.feld)!;
    const schluessel = new Map(treffer.map((z) => [z.id, anzeige(f, z.werte[s.feld])]));
    return treffer.sort((a, b) => vergleich.compare(schluessel.get(a.id)!, schluessel.get(b.id)!) * (s.ab ? -1 : 1));
  });
  // Nur die sichtbaren Zeilen stehen im Dokument – die Tabelle bleibt auch mit tausenden Einträgen schnell.
  const fenster = createMemo(() => {
    const von = Math.max(0, Math.floor(rollen().oben / ZEILENHOEHE) - 8);
    const bis = Math.min(zeilen().length, Math.ceil((rollen().oben + rollen().hoehe) / ZEILENHOEHE) + 8);
    return { von, bis, teil: zeilen().slice(von, bis) };
  });
  const karte = createMemo(() => { const id = gewaehlt(); const z = id ? sicht[m.name]?.[id] : undefined; return z && !z.geloescht ? z : undefined; });
  const breite = createMemo(() => spalten.sichtbare().reduce((s, f) => s + spalten.breite(f), 0));

  onMount(() => {
    const b = new ResizeObserver(() => setRollen((r) => ({ ...r, hoehe: kasten.clientHeight })));
    b.observe(kasten);
    onCleanup(() => b.disconnect());
  });

  const waehle = (z: Zeile | undefined) => {
    if (!z) return;
    setGewaehlt(z.id);
    const i = zeilen().indexOf(z);
    const oben = i * ZEILENHOEHE, kopf = 35;
    if (oben < kasten.scrollTop) kasten.scrollTop = oben;
    else if (oben + ZEILENHOEHE + kopf > kasten.scrollTop + kasten.clientHeight) kasten.scrollTop = oben + ZEILENHOEHE + kopf - kasten.clientHeight;
  };
  const tasten = (e: KeyboardEvent) => {
    const l = zeilen();
    const i = l.findIndex((z) => z.id === gewaehlt());
    const seite = Math.max(1, Math.floor(kasten.clientHeight / ZEILENHOEHE) - 2);
    const schritt: Record<string, number> = { ArrowDown: i + 1, ArrowUp: i - 1, PageDown: i + seite, PageUp: i - seite, Home: 0, End: l.length - 1 };
    if (e.key in schritt) { e.preventDefault(); waehle(l[Math.max(0, Math.min(l.length - 1, schritt[e.key]!))]); }
    else if (e.key === 'Enter' && karte()) { e.preventDefault(); setZugeklappt(false); queueMicrotask(() => wurzel.querySelector<HTMLElement>('.karte input:not([readonly]), .karte textarea')?.focus()); }
    else if (e.key === 'Delete' && karte() && darf(m.name, 'loeschen') && !m.einzeln) { e.preventDefault(); const z = karte()!; waehle(l[i + 1] ?? l[i - 1]); loesche(m, z); }
    else if (e.key === 'Escape' && gewaehlt()) { e.preventDefault(); setGewaehlt(null); }
    else if (e.key === '/') { e.preventDefault(); suchfeld.focus(); }
  };
  // Esc in der Karte: zurück in die Tabelle
  const kartenTaste = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); (document.activeElement as HTMLElement)?.blur(); kasten.focus(); } };

  const duplizieren = (z: Zeile) => {
    const werte = { ...z.werte };
    for (const f of m.felder) if (f.eindeutig) werte[f.name] = leerwert(f);
    werte[m.anzeigeFeld] = `${z.werte[m.anzeigeFeld]} (Kopie)`;
    setNeu(werte);
  };
  const zeilenMenue = (e: MouseEvent, z: Zeile) => {
    setGewaehlt(z.id);
    zeigeMenue(e, [
      { titel: 'Öffnen', tun: () => { setZugeklappt(false); } },
      { titel: 'In eigenem Fenster öffnen', tun: () => inEigenemFenster(m, z.id) },
      ...(darf(m.name, 'schreiben') ? [{ titel: 'Duplizieren …', tun: () => duplizieren(z) }] : []),
      ...(darf(m.name, 'loeschen') && !m.einzeln ? [{ titel: 'Löschen', gefahr: true, tun: () => loesche(m, z) }] : []),
    ]);
  };

  // Spalten: Breite ziehen, Reihenfolge ziehen
  let gezogen = '';
  const breiteZiehen = (e: PointerEvent, f: Feld) => {
    e.preventDefault(); e.stopPropagation();
    const start = e.clientX, b0 = spalten.breite(f);
    const bewegt = (x: PointerEvent) => spalten.setzeBreite(f.name, b0 + x.clientX - start, false);
    const fertig = (x: PointerEvent) => { spalten.setzeBreite(f.name, b0 + x.clientX - start, true); removeEventListener('pointermove', bewegt); removeEventListener('pointerup', fertig); };
    addEventListener('pointermove', bewegt); addEventListener('pointerup', fertig);
  };

  return (
    <div class="liste-rahmen" classList={{ 'mit-karte': !!karte() && !zugeklappt() }} ref={wurzel}>
      <section class="liste">
        <div class="leiste">
          <input ref={suchfeld} class="suche" type="search" placeholder={`${m.titelMehrzahl} durchsuchen`} aria-label="Suchen" value={suche()}
            onInput={(e) => { setSuche(e.currentTarget.value); kasten.scrollTop = 0; }} onKeyDown={(e) => { if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); kasten.focus(); if (!zeilen().some((z) => z.id === gewaehlt())) waehle(zeilen()[0]); } }} />
          <span class="zaehler">{zeilen().length === lebend().length ? `${lebend().length} ${lebend().length === 1 ? m.titel : m.titelMehrzahl}` : `${zeilen().length} von ${lebend().length}`}</span>
          <button class="knopf still" aria-label="Spalten einstellen" title="Spalten" onClick={() => setSpaltenFenster(true)}>☰</button>
          <Show when={darf(m.name, 'schreiben')}><button class="knopf haupt" onClick={() => setNeu({})}>+ {m.titel}</button></Show>
        </div>
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
                <tr classList={{ gewaehlt: istGewaehlt(z.id) }} onClick={() => { setGewaehlt(z.id); setZugeklappt(false); }} onContextMenu={(e) => zeilenMenue(e, z)}
                  onDblClick={() => wurzel.querySelector<HTMLElement>('.karte input:not([readonly])')?.focus()}>
                  <For each={spalten.sichtbare()}>{(f) => <td>{anzeige(f, z.werte[f.name])}</td>}</For>
                </tr>
              )}</For>
              <tr aria-hidden="true" style={{ height: `${(zeilen().length - fenster().bis) * ZEILENHOEHE}px` }} />
            </tbody>
          </table>
          <Show when={!zeilen().length}>
            <div class="leer">{lebend().length ? 'Kein Treffer für diese Suche.' : `Noch keine ${m.titelMehrzahl}.${darf(m.name, 'schreiben') ? ` Mit „+ ${m.titel}“ legst du den ersten Eintrag an.` : ''}`}</div>
          </Show>
        </div>
      </section>
      <Show when={karte()}>{(z) => (
        <Show when={!zugeklappt()} fallback={
          <button class="reiter" title="Karte aufklappen" onClick={() => setZugeklappt(false)}><span>{String(z().werte[m.anzeigeFeld] ?? m.titel)}</span></button>
        }>
          <div class="karten-halter" onKeyDown={kartenTaste}>
            <Detailkarte modell={m} zeile={z()} onZu={() => setGewaehlt(null)} onZuklappen={() => setZugeklappt(true)} zusatz={p.kartenZusatz} />
          </div>
        </Show>
      )}</Show>
      <Show when={neu()}>{(start) => <NeuFenster modell={m} start={start()} onZu={(id) => { setNeu(null); if (id) { setGewaehlt(id); setZugeklappt(false); } }} />}</Show>
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
    </div>
  );
}

export function Detailkarte(p: { modell: ObjektModell; zeile: Zeile; onZu?: () => void; onZuklappen?: () => void; zusatz?: (z: Zeile) => JSX.Element }) {
  const schreiben = () => darf(p.modell.name, 'schreiben');
  const [fehler, setFehler] = createStore<Record<string, string | undefined>>({});
  const titel = () => String(p.zeile.werte[p.modell.anzeigeFeld] ?? '');
  const aendern = (f: Feld, w: Wert) => {
    try {
      const sauber = pruefeWerte(p.modell, { [f.name]: w }, false);
      setFehler(f.name, undefined);
      if (sauber[f.name] === p.zeile.werte[f.name]) return;
      ausfuehren({ objekt: p.modell.name, art: 'aendern', objektId: p.zeile.id, werte: sauber }, `${f.titel} von „${titel()}“ ändern`);
    } catch (e) {
      if (e instanceof Eingabefehler) setFehler(f.name, e.felder[f.name]); else throw e;
    }
  };
  return (
    <aside class="karte" aria-label={`${p.modell.titel} ${titel()}`}>
      <div class="karte-kopf">
        <Show when={p.onZu}><button class="knopf still nur-schmal" onClick={p.onZu}>‹ Liste</button></Show>
        <h2>{titel() || p.modell.titel}</h2>
        <Show when={p.onZuklappen}>
          <button class="knopf still nur-breit" aria-label="In eigenem Fenster öffnen" title="In eigenem Fenster öffnen" onClick={() => inEigenemFenster(p.modell, p.zeile.id)}>⧉</button>
          <button class="knopf still nur-breit" aria-label="Karte zuklappen" title="Zuklappen" onClick={p.onZuklappen}>⇥</button>
        </Show>
        <Show when={p.onZu}><button class="knopf still nur-breit" aria-label="Karte schließen" title="Schließen (Esc)" onClick={p.onZu}>×</button></Show>
      </div>
      <div class="karte-inhalt">
        <For each={gruppen(p.modell)}>{(g) => (
          <fieldset>
            <Show when={g.titel}><legend>{g.titel}</legend></Show>
            <For each={g.felder}>{(f) => <FeldEingabe feld={f} wert={p.zeile.werte[f.name] ?? null} fehler={fehler[f.name]} gesperrt={!schreiben()} onWert={(w) => aendern(f, w)} />}</For>
          </fieldset>
        )}</For>
        {p.zusatz?.(p.zeile)}
        <Show when={!schreiben()}><p class="still-text klein-text">Du kannst diese Angaben ansehen, aber nicht ändern.</p></Show>
        <Show when={p.onZu && !p.modell.einzeln && darf(p.modell.name, 'loeschen')}>
          <div class="karte-fuss"><button class="knopf gefahr" onClick={() => loesche(p.modell, p.zeile)}>{p.modell.titel} löschen</button></div>
        </Show>
      </div>
    </aside>
  );
}

function NeuFenster(p: { modell: ObjektModell; start: Werte; onZu: (id?: string) => void }) {
  const start: Werte = {};
  for (const f of p.modell.felder) start[f.name] = p.start[f.name] ?? leerwert(f);
  const [werte, setWerte] = createStore<Werte>(start);
  const [fehler, setFehler] = createStore<Record<string, string | undefined>>({});
  const ok = () => {
    try {
      const sauber = pruefeWerte(p.modell, { ...werte }, true);
      const id = neueKennung();
      ausfuehren({ objekt: p.modell.name, art: 'anlegen', objektId: id, werte: sauber }, `„${sauber[p.modell.anzeigeFeld]}“ anlegen`);
      p.onZu(id);
    } catch (e) {
      if (!(e instanceof Eingabefehler)) throw e;
      for (const f of p.modell.felder) setFehler(f.name, e.felder[f.name]);
    }
  };
  return (
    <Dialog titel={`${p.modell.titel} anlegen`} breit onAbbrechen={() => p.onZu()}
      knoepfe={<><button class="knopf" onClick={() => p.onZu()}>Abbrechen</button><button class="knopf haupt" onClick={ok}>Anlegen</button></>}>
      <form class="raster" onSubmit={(e) => { e.preventDefault(); ok(); }}>
        <For each={p.modell.felder.filter((f) => f.art !== 'langtext' && f.art !== 'verweis')}>{(f) => (
          <FeldEingabe feld={f} wert={werte[f.name] ?? null} fehler={fehler[f.name]} sofort onWert={(w) => setWerte(f.name, w)} />
        )}</For>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
