// Die übliche Ansicht eines Objekts: Sie baut nichts selbst, sondern setzt die fertigen Bausteine
// in den Rahmen – Baum links, Tabelle in die Mitte, Detailkarte rechts – und verbindet sie.
import { Show, createMemo, createSignal, untrack, type JSX } from 'solid-js';
import { unwrap } from 'solid-js/store';
import { leerwert, type ObjektModell, type Werte } from '../kern/modell';
import type { Zeile } from '../kern/befehl';
import { geaendert, sicht } from './abgleich';
import { darf } from './api';
import type { Anpassung } from './baukasten/anpassung';
import { Baum, type Knoten } from './baukasten/baum';
import { Detailkarte, NeuFenster, inEigenemFenster, loesche } from './baukasten/detailkarte';
import { anzeige } from './baukasten/feld';
import { Rahmen, type RahmenSteuer } from './baukasten/rahmen';
import { Tabelle, type TabellenSteuer } from './baukasten/tabelle';

const vergleich = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
const TRENNER = '\u0001';

export function ObjektAnsicht(p: {
  schluessel: string; modell: ObjektModell; baum?: string[]; anpassung?: Anpassung;
  fest?: () => Werte;            // Zusammenhang: nur Einträge mit diesen Werten (Projekt, Version); neue bekommen sie
  unterMenue?: JSX.Element;      // z. B. die Versionsleiste
}) {
  const m = p.modell;
  const a = p.anpassung ?? {};
  const baumFelder = (p.baum ?? []).map((n) => m.felder.find((f) => f.name === n)!);
  const [suche, setSuche] = createSignal('');
  const [gewaehlt, setGewaehlt] = createSignal<string | null>(null);
  const [ast, setAst] = createSignal('');            // gewählter Knoten im Baum ('' = alle)
  const [neu, setNeu] = createSignal<Werte | null>(null);
  let rahmen!: RahmenSteuer, tabelle!: TabellenSteuer, suchfeld!: HTMLInputElement, wurzel!: HTMLDivElement;

  const fest = () => p.fest?.() ?? {};
  // Listen hängen am Zähler der Objektart, nicht an jedem Feld jeder Zeile (siehe abgleich.ts) – gelesen wird ohne Abhören.
  const roh = (z: Zeile) => unwrap(z);
  const lebend = createMemo(() => {
    geaendert(m.name);
    const f = Object.entries(fest());
    return untrack(() => Object.values(sicht[m.name] ?? {}).filter((z) => { const r = roh(z); return !r.geloescht && f.every(([k, w]) => r.werte[k] === w); }));
  });
  const neuStart = (werte: Werte = {}) => setNeu({ ...(a.neuVorgabe?.(lebend()) ?? {}), ...werte, ...fest() });
  const pfad = (z: Zeile, tiefe: number) => baumFelder.slice(0, tiefe).map((f) => anzeige(f, roh(z).werte[f.name])).join(TRENNER);
  // Baum: Gliederung nach den Feldern, die der Beipackzettel nennt – mit Anzahl je Knoten.
  const knoten = createMemo((): Knoten[] => {
    const ebene = (zeilen: Zeile[], tiefe: number, vor: string): Knoten[] => {
      if (tiefe >= baumFelder.length) return [];
      const f = baumFelder[tiefe]!;
      const gruppen = new Map<string, Zeile[]>();
      for (const z of zeilen) { const w = anzeige(f, roh(z).werte[f.name]); (gruppen.get(w) ?? gruppen.set(w, []).get(w)!).push(z); }
      return [...gruppen.entries()].sort((x, y) => (x[0] === '' ? 1 : y[0] === '' ? -1 : vergleich.compare(x[0], y[0]))).map(([w, l]) => {
        const id = vor + w;
        return { id: 'k' + TRENNER + id, titel: w || `ohne ${f.titel}`, anzahl: l.length, kinder: ebene(l, tiefe + 1, id + TRENNER) };
      });
    };
    return [{ id: '', titel: `Alle ${m.titelMehrzahl}`, anzahl: lebend().length, kinder: ebene(lebend(), 0, '') }];
  });
  const zeilen = createMemo(() => {
    let l = lebend();
    if (ast()) { const soll = ast().slice(2); const tiefe = soll.split(TRENNER).length; l = l.filter((z) => pfad(z, tiefe) === soll); }
    const worte = suche().toLowerCase().split(/\s+/).filter(Boolean);
    if (worte.length) l = l.filter((z) => { const t = suchtext(z).toLowerCase(); return worte.every((w) => t.includes(w)); });
    return l;
  });
  // Text, in dem gesucht wird: einfache Felder direkt, Auswahl/Datum/Verweis so, wie sie angezeigt werden.
  const umgesetzt = m.felder.filter((f) => f.art === 'auswahl' || f.art === 'mehrfach' || f.art === 'datum' || f.art === 'verweis');
  const suchtext = (z: Zeile) => { const w = roh(z).werte; return Object.values(w).join(' ') + ' ' + umgesetzt.map((f) => anzeige(f, w[f.name])).join(' '); };
  // Die Karte zeigt nur, was zum Zusammenhang gehört: nach dem Wechsel von Projekt oder Version bleibt keine fremde Karte stehen.
  const karte = createMemo(() => { const id = gewaehlt(); return id ? lebend().find((z) => z.id === id) : undefined; });

  const insErsteFeld = () => { rahmen.detailsZeigen(); queueMicrotask(() => wurzel.querySelector<HTMLElement>('.karte input:not([readonly]), .karte textarea')?.focus()); };
  const duplizieren = (z: Zeile) => {
    const werte = { ...z.werte };
    for (const f of m.felder) if (f.eindeutig) werte[f.name] = leerwert(f);
    werte[m.anzeigeFeld] = `${z.werte[m.anzeigeFeld]} (Kopie)`;
    neuStart(werte);
  };
  const darfLoeschen = () => darf(m.name, 'loeschen') && !m.einzeln;
  const leer = () => lebend().length ? 'Kein Treffer für diese Auswahl.' : `Noch keine ${m.titelMehrzahl}.${darf(m.name, 'schreiben') ? ` Mit „+ ${m.titel}“ legst du den ersten Eintrag an.` : ''}`;

  return (
    <div class="ansicht" ref={wurzel} onKeyDown={(e) => { if (e.key === 'Escape' && !e.defaultPrevented && (e.target as HTMLElement).closest('.karte')) { e.preventDefault(); tabelle.fokus(); } }}>
      <Rahmen schluessel={p.schluessel} steuer={(s) => (rahmen = s)}
        knoepfe={[
          ...(a.knoepfe?.(fest()) ?? []),
          { titel: 'Spalten einstellen', symbol: '☰', nurSymbol: true, tun: () => tabelle.spaltenEinstellen() },
          ...(darf(m.name, 'schreiben') ? [{ titel: m.titel, symbol: '+', haupt: true, tun: () => neuStart() }] : []),
        ]}
        menueMitte={<>
          <input ref={suchfeld} class="suche" type="search" placeholder={`${m.titelMehrzahl} durchsuchen`} aria-label="Suchen" value={suche()} onInput={(e) => setSuche(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); tabelle.fokus(); tabelle.ersteWaehlen(); } }} />
          <span class="zaehler">{zeilen().length === lebend().length ? `${lebend().length} ${lebend().length === 1 ? m.titel : m.titelMehrzahl}` : `${zeilen().length} von ${lebend().length}`}</span>
        </>}
        unterMenue={p.unterMenue}
        baumTitel="Gliederung"
        baum={baumFelder.length ? <Baum titel={`Gliederung ${m.titelMehrzahl}`} knoten={knoten()} gewaehlt={ast()} onWahl={setAst} symbol={a.baumSymbol} /> : undefined}
        inhalt={
          <Tabelle modell={m} zeilen={zeilen()} gewaehlt={gewaehlt()} leer={leer()} steuer={(s) => (tabelle = s)} zelle={a.zelle}
            onWahl={setGewaehlt} onOeffnen={insErsteFeld} onSuche={() => suchfeld.focus()}
            onLoeschen={darfLoeschen() ? (z) => loesche(m, z) : undefined}
            zeilenMenue={(z) => [
              { titel: 'Öffnen', tun: insErsteFeld },
              { titel: 'In eigenem Fenster öffnen', tun: () => inEigenemFenster(m, z.id) },
              ...(a.zeilenMenue?.(z) ?? []),
              ...(darf(m.name, 'schreiben') ? [{ titel: 'Duplizieren …', tun: () => duplizieren(z) }] : []),
              ...(darfLoeschen() ? [{ titel: 'Löschen', gefahr: true, tun: () => loesche(m, z) }] : []),
            ]} />
        }
        detailsTitel={String(karte()?.werte[m.anzeigeFeld] ?? m.titel)}
        details={karte() ? <Show when={karte()}>{(z) => <Detailkarte modell={m} zeile={z()} onZu={() => setGewaehlt(null)} onZuklappen={() => rahmen.detailsZuklappen()} zusatz={a.kartenZusatz} symbole={a.kartenSymbole} verborgen={Object.keys(fest())} />}</Show> : undefined} />
      <Show when={neu()}>{(start) => <NeuFenster modell={m} start={start()} verborgen={Object.keys(fest())} onZu={(id) => { setNeu(null); if (id) { setGewaehlt(id); rahmen.detailsZeigen(); } }} />}</Show>
    </div>
  );
}
