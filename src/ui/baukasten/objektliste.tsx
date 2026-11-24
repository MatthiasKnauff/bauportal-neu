// Baustein „Liste mit Detailkarte“: Tabelle links, Karte rechts – beides erzeugt aus dem Datenmodell.
// Jedes Modul, das Objekte verwaltet, benutzt diesen einen Baustein.
import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import { createStore } from 'solid-js/store';
import { Eingabefehler, leerwert, pruefeWerte, type Feld, type ObjektModell, type Wert, type Werte } from '../../kern/modell';
import type { Zeile } from '../../kern/befehl';
import { ausfuehren, rueckgaengig, sicht } from '../abgleich';
import { darf, neueKennung } from '../api';
import { Dialog } from './dialog';
import { FeldEingabe, anzeige } from './feld';
import { hinweis } from './hinweise';

const vergleich = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });

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

export function ObjektListe(p: { modell: ObjektModell; kartenZusatz?: (z: Zeile) => JSX.Element }) {
  const m = () => p.modell;
  const spalten = createMemo(() => m().felder.filter((f) => f.inListe));
  const [suche, setSuche] = createSignal('');
  const [sort, setSort] = createSignal<{ feld: string; ab: boolean }>({ feld: m().anzeigeFeld, ab: false });
  const [gewaehlt, setGewaehlt] = createSignal<string | null>(null);
  const [neu, setNeu] = createSignal(false);

  const zeilen = createMemo(() => {
    const alle = Object.values(sicht[m().name] ?? {}).filter((z) => !z.geloescht);
    const worte = suche().toLowerCase().split(/\s+/).filter(Boolean);
    const treffer = worte.length
      ? alle.filter((z) => { const t = Object.values(z.werte).join(' ').toLowerCase(); return worte.every((w) => t.includes(w)); })
      : alle;
    const s = sort();
    const f = m().felder.find((x) => x.name === s.feld)!;
    return treffer.sort((a, b) => vergleich.compare(anzeige(f, a.werte[s.feld]), anzeige(f, b.werte[s.feld])) * (s.ab ? -1 : 1));
  });
  const anzahl = createMemo(() => Object.values(sicht[m().name] ?? {}).filter((z) => !z.geloescht).length);
  const karte = createMemo(() => { const id = gewaehlt(); const z = id ? sicht[m().name]?.[id] : undefined; return z && !z.geloescht ? z : undefined; });

  const tasten = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const l = zeilen();
    const i = l.findIndex((z) => z.id === gewaehlt());
    const n = l[Math.max(0, Math.min(l.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (n) { e.preventDefault(); setGewaehlt(n.id); document.getElementById('z-' + n.id)?.scrollIntoView({ block: 'nearest' }); }
  };

  return (
    <div class="liste-rahmen" classList={{ 'mit-karte': !!karte() }}>
      <section class="liste">
        <div class="leiste">
          <input class="suche" type="search" placeholder={`${m().titelMehrzahl} durchsuchen`} aria-label="Suchen" value={suche()} onInput={(e) => setSuche(e.currentTarget.value)} />
          <span class="zaehler">{zeilen().length === anzahl() ? `${anzahl()} ${anzahl() === 1 ? m().titel : m().titelMehrzahl}` : `${zeilen().length} von ${anzahl()}`}</span>
          <Show when={darf(m().name, 'schreiben')}><button class="knopf haupt" onClick={() => setNeu(true)}>+ {m().titel}</button></Show>
        </div>
        <div class="tabelle-rollen" tabindex="0" onKeyDown={tasten}>
          <table class="tabelle">
            <thead><tr>
              <For each={spalten()}>{(f) => (
                <th style={{ width: f.breite ? `${f.breite}px` : undefined }} aria-sort={sort().feld === f.name ? (sort().ab ? 'descending' : 'ascending') : 'none'}>
                  <button onClick={() => setSort((s) => ({ feld: f.name, ab: s.feld === f.name ? !s.ab : false }))}>
                    {f.titel}<span class="pfeil">{sort().feld === f.name ? (sort().ab ? '▼' : '▲') : ''}</span>
                  </button>
                </th>
              )}</For>
            </tr></thead>
            <tbody>
              <For each={zeilen()}>{(z) => (
                <tr id={'z-' + z.id} classList={{ gewaehlt: gewaehlt() === z.id }} onClick={() => setGewaehlt(z.id)}>
                  <For each={spalten()}>{(f) => <td>{anzeige(f, z.werte[f.name])}</td>}</For>
                </tr>
              )}</For>
            </tbody>
          </table>
          <Show when={!zeilen().length}>
            <div class="leer">{anzahl() ? 'Kein Treffer für diese Suche.' : `Noch keine ${m().titelMehrzahl}.${darf(m().name, 'schreiben') ? ` Mit „+ ${m().titel}“ legst du den ersten Eintrag an.` : ''}`}</div>
          </Show>
        </div>
      </section>
      <Show when={karte()}>{(z) => <Detailkarte modell={m()} zeile={z()} onZu={() => setGewaehlt(null)} zusatz={p.kartenZusatz} />}</Show>
      <Show when={neu()}><NeuFenster modell={m()} onZu={(id) => { setNeu(false); if (id) setGewaehlt(id); }} /></Show>
    </div>
  );
}

export function Detailkarte(p: { modell: ObjektModell; zeile: Zeile; onZu?: () => void; zusatz?: (z: Zeile) => JSX.Element }) {
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
  const loeschen = () => {
    const name = titel();
    ausfuehren({ objekt: p.modell.name, art: 'loeschen', objektId: p.zeile.id }, `„${name}“ löschen`);
    hinweis(`„${name}“ gelöscht.`, { aktion: { titel: 'Rückgängig', tun: rueckgaengig } });
  };
  return (
    <aside class="karte" aria-label={`${p.modell.titel} ${titel()}`}>
      <div class="karte-kopf">
        <Show when={p.onZu}><button class="knopf still nur-schmal" onClick={p.onZu}>‹ Liste</button></Show>
        <h2>{titel() || p.modell.titel}</h2>
        <Show when={p.onZu}><button class="knopf still nur-breit" aria-label="Karte schließen" onClick={p.onZu}>×</button></Show>
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
        <Show when={!p.modell.einzeln && darf(p.modell.name, 'loeschen')}><div class="karte-fuss"><button class="knopf gefahr" onClick={loeschen}>{p.modell.titel} löschen</button></div></Show>
      </div>
    </aside>
  );
}

function NeuFenster(p: { modell: ObjektModell; onZu: (id?: string) => void }) {
  const start: Werte = {};
  for (const f of p.modell.felder) start[f.name] = leerwert(f);
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
