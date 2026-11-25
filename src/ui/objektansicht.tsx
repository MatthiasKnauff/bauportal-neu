// Die übliche Ansicht eines Objekts: Sie baut nichts selbst, sondern setzt die fertigen Bausteine
// in den Rahmen – Baum links, Tabelle in die Mitte, Detailkarte rechts – und verbindet sie.
import { herunterladen } from './baukasten/herunterladen';
import { Show, createEffect, createMemo, createSignal, on, untrack, type JSX } from 'solid-js';
import { sprungAbholen } from './sprung';
import { unwrap } from 'solid-js/store';
import { leerwert, type Feld, type ObjektModell, type Werte } from '../kern/modell';
import { LEER, artWeg, erfuellt, hat, umschalten, werteIn, type Bedingung } from '../kern/filterbedingung';
import { Filterkaesten, Filtersuche, type FilterArt } from './baukasten/filterkaesten';
import type { Zeile } from '../kern/befehl';
import { geaendert, lebende, objektname, sicht } from './unterbau/abgleich';
import { projektId } from './projekt';
import { darf } from './unterbau/api';
import type { Anpassung } from './baukasten/anpassung';
import type { Knopf } from './baukasten/menueleiste';
import { Baum, type Knoten } from './baukasten/baum';
import { Seitenliste, type SeitenAbschnitt } from './baukasten/seitenliste';
import type { LinksFilter } from '../kern/modul';
import { Schwebefenster } from './baukasten/schwebefenster';
import { Detailkarte, NeuFenster, inEigenemFenster, loesche, feldAendern } from './baukasten/detailkarte';
import { anzeige } from './baukasten/feld';
import { Rahmen, type RahmenSteuer } from './baukasten/rahmen';
import { Tabelle, type TabellenSteuer } from './baukasten/tabelle';
import { Kacheln } from './baukasten/kacheln';

const vergleich = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
const TRENNER = '\u0001';

export function ObjektAnsicht(p: {
  schluessel: string; modell: ObjektModell; baum?: string[]; anpassung?: Anpassung;
  linksFilter?: LinksFilter[];   // links Filter in Abschnitten statt des Baums
  suchArten?: { titel: string; felder: string[] }[];   // weitere Arten der Filterbedingung, nur über das Suchfeld
  fest?: () => Werte;            // Zusammenhang: nur Einträge mit diesen Werten (Projekt, Version); neue bekommen sie
  unterMenue?: JSX.Element;      // z. B. die Versionsleiste
}) {
  const m = p.modell;
  const a = p.anpassung ?? {};
  const baumFelder = (p.baum ?? []).map((n) => m.felder.find((f) => f.name === n)!);
  const [suche, setSuche] = createSignal('');
  const [filter, setFilter] = createSignal<Record<string, string>>({});   // Filterzeile der Tabelle: Text je Spalte
  const [gewaehlt, setGewaehlt] = createSignal<string | null>(null);
  const [ast, setAst] = createSignal('');            // gewählter Knoten im Baum ('' = alle)
  const [bed, setBed] = createSignal<Bedingung>(LEER);   // Filterbedingung (links und Vorschläge im Suchfeld): UND, ODER, NICHT
  const [neu, setNeu] = createSignal<Werte | null>(null);
  const [mitteKnoepfe, setMitteKnoepfe] = createSignal<Knopf[]>([]);   // Befehle einer eigenen Mitte
  const [reihe, setReihe] = createSignal<string[] | null>(null);   // Reihenfolge, die Tabelle oder eigene Mitte (Balkenplan) gerade zeigen
  // Tabelle oder Kacheln – nur, wo das Modul Kacheln einstellt; gemerkt je Objektart, am Handy zuerst Kacheln
  const FORM = `bp.form.${m.name}`;
  const [kacheln, setKacheln] = createSignal(!!a.kachel && (() => { try { const x = localStorage.getItem(FORM); return x ? x === 'kacheln' : !!a.kachelnZuerst || matchMedia('(max-width: 860px)').matches; } catch { return false; } })());
  const formWechseln = () => { setKacheln(!kacheln()); try { localStorage.setItem(FORM, kacheln() ? 'kacheln' : 'tabelle'); } catch { /* ohne Speicher gilt es bis zum Neuladen */ } };
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
  // ---------- Filterbedingung: Arten aus den Abschnitten links und den Arten des Suchfelds ----------
  // Werte eines Felds als Liste: Auswahl wie gespeichert, Text und Stichwörter einzeln („Dachdecker, Zimmerer“ → zwei)
  const liste = (f: Feld, w: Werte[string] | undefined): string[] => {
    if (w === null || w === undefined || w === '') return [];
    if (f.art === 'auswahl' || f.art === 'ja_nein' || f.art === 'verweis') return [String(w)];
    return anzeige(f, w).split(/\s*[,;]\s*/).map((x) => x.trim()).filter(Boolean);
  };
  const feld = (name: string) => m.felder.find((x) => x.name === name)!;
  // „nur“: nur Einträge mit diesen Werten zählen; „eigen“ steht für die eigenen Werte einer Auswahl
  const nurPasst = (lf: LinksFilter, w: Werte) => Object.entries(lf.nur ?? {}).every(([k, ws]) => {
    const v = String(w[k] ?? ''), f = feld(k);
    return ws.includes(v) || (ws.includes('eigen') && !!f.eigeneWerte && v !== '' && !f.optionen!.some((o) => o.wert === v));
  });
  // Beteiligte: je Eintrag die Projekte, in denen ein anderes Objekt auf ihn verweist (z. B. Kontakt → Projekt)
  const bet = p.linksFilter?.find((lf) => lf.beteiligt)?.beteiligt;
  const projekteVon = createMemo(() => {
    const k = new Map<string, string[]>();
    if (bet) { geaendert(bet.objekt); for (const x of lebende(bet.objekt)) { const id = String(x.werte[bet.feld] ?? ''), pr = String(x.werte.projekt ?? ''); if (id && pr) (k.get(id) ?? k.set(id, []).get(id)!).push(pr); } }
    return k;
  });
  const projektName = (id: string) => String(sicht.projekt?.[id]?.werte.name ?? '(Projekt nicht sichtbar)');
  const werteVon = (id: string) => roh(sicht[m.name]![id]!).werte;
  const arten = createMemo((): FilterArt[] => [
    ...(p.linksFilter ?? []).map((lf, nr): FilterArt => {
      if (lf.beteiligt) return { key: `l${nr}`, titel: lf.art ?? lf.titel, werte: (id) => projekteVon().get(id) ?? [], wertTitel: projektName };
      const f = feld(lf.feld!);
      return { key: `l${nr}`, titel: lf.art ?? lf.titel, werte: (id) => { const w = werteVon(id); return nurPasst(lf, w) ? liste(f, w[lf.feld!]) : []; }, wertTitel: f.art === 'auswahl' ? (w) => anzeige(f, w) || w : undefined };
    }),
    ...(p.suchArten ?? []).map((sa, i): FilterArt => ({ key: `s${i}`, titel: sa.titel, werte: (id) => { const w = werteVon(id); return sa.felder.flatMap((n) => liste(feld(n), w[n])); } })),
  ]);
  const art = (key: string) => arten().find((a) => a.key === key)!;
  const nimm = (key: string, w: string, nicht = false) => setBed(umschalten(bed(), key, w, nicht));
  // Start wie im bisherigen Bauportal: mit den Beteiligten des gewählten Projekts – außer die Person will es ohne
  const betNr = (p.linksFilter ?? []).findIndex((lf) => lf.beteiligt), betKey = `l${betNr}`;
  const OHNE = `bp.ohneProjekt.${p.schluessel}`;
  const [ohneProjekt, setOhneProjekt] = createSignal((() => { try { return localStorage.getItem(OHNE) === 'ja'; } catch { return false; } })());
  const ohneMerken = (an: boolean) => { setOhneProjekt(an); try { localStorage.setItem(OHNE, an ? 'ja' : 'nein'); } catch { /* gilt dann bis zum Neuladen */ } };
  if (betNr >= 0) createEffect(on(projektId, (pid, alt) => untrack(() => {
    const drin = werteIn(bed(), betKey);
    const ohne = artWeg(bed(), betKey);
    const hatBeteiligte = !!pid && [...projekteVon().values()].some((l) => l.includes(pid));
    if (alt === undefined) { if (pid && hatBeteiligte && !ohneProjekt()) setBed(umschalten(ohne, betKey, pid)); return; }
    if (drin.length === 1 && drin[0] === alt) setBed(pid && hatBeteiligte ? umschalten(ohne, betKey, pid) : ohne);   // Projekt gewechselt: der Filter zieht mit
  })));
  // Abschnitte links: je Wert die Anzahl; gewählt ist, was in der Bedingung steht
  const linksAbschnitte = createMemo((): SeitenAbschnitt[] => (p.linksFilter ?? []).flatMap((lf, nr): SeitenAbschnitt[] => {
    const key = `l${nr}`, a = art(key);
    const zahl = new Map<string, number>();
    for (const z of lebend()) for (const w of new Set(a.werte(z.id))) zahl.set(w, (zahl.get(w) ?? 0) + 1);
    if (lf.beteiligt) {
      const pid = projektId() && sicht.projekt?.[projektId()!] && !sicht.projekt[projektId()!]!.geloescht ? projektId()! : '';
      const andere = [...zahl.keys()].filter((x) => x !== pid).sort((x, y) => vergleich.compare(projektName(x), projektName(y)));
      return [{ titel: lf.titel, suche: lf.suche && andere.length > 6, eintraege: [
        ...(pid ? [{ id: `${nr}:${pid}`, titel: `${lf.beteiligt.titel} ${projektName(pid)}`, anzahl: zahl.get(pid) ?? 0, zeichen: 'projekte',
          nach: <label class="seitenliste-schalter"><input type="checkbox" checked={ohneProjekt()} onChange={(e) => ohneMerken(e.currentTarget.checked)} /> immer ohne Projekt beginnen</label> }] : []),
        ...andere.map((x) => ({ id: `${nr}:${x}`, titel: projektName(x), anzahl: zahl.get(x) ?? 0, zeichen: 'projekte' })),
      ] }];
    }
    const f = feld(lf.feld!);
    const eigene = f.eigeneWerte ? [...zahl.keys()].filter((w) => w && !f.optionen!.some((o) => o.wert === w)).sort((x, y) => vergleich.compare(x, y)) : [];
    const werte = f.art === 'auswahl' ? [...f.optionen!.map((o) => o.wert).filter((w) => w !== ''), ...eigene] : [...zahl.keys()].sort((x, y) => vergleich.compare(x, y));
    return [{ titel: lf.titel, suche: lf.suche, eintraege: [
      ...(lf.alle !== undefined ? [{ id: `${nr}:*`, titel: lf.alle, anzahl: lebend().length, zeichen: 'personen' }] : []),
      ...werte.map((w) => ({ id: `${nr}:${w}`, titel: lf.mehrzahl?.[w] ?? (anzeige(f, w) || w), anzahl: zahl.get(w) ?? 0, zeichen: lf.zeichen?.[w] ?? (f.art === 'auswahl' ? undefined : 'liste') })),
    ] }];
  }));
  const linksTeile = (id: string) => { const k = id.indexOf(':'); return { key: `l${id.slice(0, k)}`, w: id.slice(k + 1) }; };
  const linksAn = (id: string) => { const { key, w } = linksTeile(id); return w === '*' ? !bed().gruppen.some((g) => g.art === key) : werteIn(bed(), key).includes(w); };
  const linksNicht = (id: string) => { const { key, w } = linksTeile(id); return w !== '*' && hat(bed(), key, w) && !werteIn(bed(), key).includes(w); };
  const linksWahl = (id: string) => { const { key, w } = linksTeile(id); if (w === '*') setBed(artWeg(bed(), key)); else nimm(key, w); };
  const zeilen = createMemo(() => {
    let l = lebend();
    const b = bed();
    if (b.gruppen.length) { const a = new Map(arten().map((x) => [x.key, x])); l = l.filter((z) => erfuellt(b, (k) => a.get(k)?.werte(z.id) ?? [])); }
    if (ast()) { const soll = ast().slice(2); const tiefe = soll.split(TRENNER).length; l = l.filter((z) => pfad(z, tiefe) === soll); }
    const worte = suche().toLowerCase().split(/\s+/).filter(Boolean);
    // „-wort“ schließt aus (wie im bisherigen Bauportal)
    if (worte.length) l = l.filter((z) => { const t = suchtext(z).toLowerCase(); return worte.every((w) => (w.startsWith('-') && w.length > 1 ? !t.includes(w.slice(1)) : t.includes(w))); });
    for (const [name, text] of Object.entries(filter())) {
      const f = m.felder.find((x) => x.name === name), t = text.trim().toLowerCase();
      if (f && t) l = l.filter((z) => anzeige(f, roh(z).werte[name]).toLowerCase().includes(t));
    }
    return l;
  });
  // Text, in dem gesucht wird: einfache Felder direkt, Auswahl/Datum/Verweis so, wie sie angezeigt werden.
  const umgesetzt = m.felder.filter((f) => f.art === 'auswahl' || f.art === 'mehrfach' || f.art === 'datum' || f.art === 'verweis');
  const suchtext = (z: Zeile) => { const w = roh(z).werte; return Object.values(w).join(' ') + ' ' + umgesetzt.map((f) => anzeige(f, w[f.name])).join(' '); };
  // Die Karte zeigt nur, was zum Zusammenhang gehört: nach dem Wechsel von Projekt oder Version bleibt keine fremde Karte stehen.
  const karte = createMemo(() => { const id = gewaehlt(); return id ? lebend().find((z) => z.id === id) : undefined; });

  // Sprung aus der Suche über alles: den Eintrag wählen und die Karte zeigen
  createEffect(() => { const id = sprungAbholen(m.name); if (id) { setGewaehlt(id); queueMicrotask(() => rahmen.detailsZeigen()); } });
  // Doppelklick wie im bisherigen Bauportal: der Eintrag öffnet sich im frei beweglichen Fenster
  const [schwebend, setSchwebend] = createSignal<string | null>(null);
  const schwebZeile = createMemo(() => { const id = schwebend(); return id ? lebend().find((z) => z.id === id) : undefined; });
  const insErsteFeld = () => { rahmen.detailsZeigen(); queueMicrotask(() => wurzel.querySelector<HTMLElement>('.karte input:not([readonly]), .karte textarea')?.focus()); };
  const duplizieren = (z: Zeile) => {
    const werte = { ...z.werte };
    for (const f of m.felder) if (f.eindeutig) werte[f.name] = leerwert(f);
    werte[m.anzeigeFeld] = `${z.werte[m.anzeigeFeld]} (Kopie)`;
    neuStart(werte);
  };
  let mitteNeu: (() => void) | undefined;   // wie die eigene Mitte neu anlegt, falls sie das selbst regelt
  const mitteP = { alle: lebend, zeilen, fest, gewaehlt, onWahl: setGewaehlt, onOeffnen: insErsteFeld, setReihe, setKnoepfe: setMitteKnoepfe, setNeu: (f: () => void) => { mitteNeu = f; } };
  // Blättern in der Karte: in der Reihenfolge, die die Mitte gerade zeigt
  const blaettern = () => {
    const ids = (!kacheln() && reihe()) || zeilen().map((z) => z.id);
    const i = ids.indexOf(gewaehlt() ?? '');
    return i < 0 ? undefined : { nr: i + 1, anzahl: ids.length, onSchritt: (s: -1 | 1) => { const n = ids[i + s]; if (n) setGewaehlt(n); } };
  };
  const darfLoeschen = () => darf(m.name, 'loeschen') && !m.einzeln;
  const leer = () => lebend().length ? 'Kein Treffer für diese Auswahl.' : `Noch keine ${m.titelMehrzahl}.${darf(m.name, 'schreiben') ? ` Mit „+ ${m.titel}“ legst du den ersten Eintrag an.` : ''}`;

  return (
    <div class="ansicht" ref={wurzel} onKeyDown={(e) => { if (e.key === 'Escape' && !e.defaultPrevented && (e.target as HTMLElement).closest('.karte')) { e.preventDefault(); tabelle?.fokus(); } }}>
      <Rahmen schluessel={p.schluessel} steuer={(s) => (rahmen = s)}
        knoepfe={[
          ...(darf(m.name, 'schreiben') ? [{ titel: m.titel, zeichen: 'neu', gruppe: 'Neu', haupt: true, tun: () => (a.mitte && mitteNeu ? mitteNeu() : neuStart()) }] : []),
          ...(a.knoepfe?.(fest()) ?? []),
          ...(a.mitte ? mitteKnoepfe() : []),
          ...(a.kachel ? [{ titel: 'Karten', zeichen: 'kacheln', gruppe: 'Ansicht', an: kacheln(), tun: () => { if (!kacheln()) formWechseln(); } },
            { titel: 'Tabelle', zeichen: 'tabelle', gruppe: 'Ansicht', an: !kacheln(), tun: () => { if (kacheln()) formWechseln(); } }] : []),
          ...(a.mitte || kacheln() ? [] : [{ titel: 'Spalten', zeichen: 'spalten', gruppe: 'Ansicht', tun: () => tabelle.spaltenEinstellen() },
            { titel: 'Excel', zeichen: 'export', gruppe: 'Datei', rechts: true, tun: () => herunterladen(tabelle.alsCsv(), `${m.titelMehrzahl} ${new Date().toLocaleDateString('sv')}.csv`, 'text/csv;charset=utf-8') }]),
        ]}
        menueMitte={<>
          <Show when={arten().length} fallback={
            <input ref={suchfeld} class="suche" type="search" placeholder={`${m.titelMehrzahl} durchsuchen`} aria-label="Suchen" value={suche()} onInput={(e) => setSuche(e.currentTarget.value)}
              onKeyDown={(e) => { if ((e.key === 'ArrowDown' || e.key === 'Enter') && tabelle && !kacheln()) { e.preventDefault(); tabelle.fokus(); tabelle.ersteWaehlen(); } }} />}>
            <Filtersuche ref={(el) => (suchfeld = el)} text={suche()} onText={setSuche} arten={arten()} ids={() => lebend().map((z) => z.id)} onNehmen={nimm} platzhalter={`${m.titelMehrzahl} durchsuchen und filtern`}
              onWeiter={() => { if (tabelle && !kacheln()) { tabelle.fokus(); tabelle.ersteWaehlen(); } }} />
          </Show>
          <span class="zaehler">{zeilen().length === lebend().length ? `${lebend().length} ${lebend().length === 1 ? m.titel : m.titelMehrzahl}` : `${zeilen().length} von ${lebend().length}`}</span>
        </>}
        unterMenue={<>{p.unterMenue}{a.oben?.(fest())}
          <Show when={!a.mitte && !kacheln() && darf(m.name, 'schreiben')}><p class="ansicht-hinweis nur-breit">Zelle anklicken und tippen – gespeichert wird beim Verlassen des Feldes · Doppelklick: im eigenen Fenster öffnen</p></Show></>}
        baumTitel={a.linksTitel ?? 'Gliederung'}
        baum={a.links ? a.links(mitteP) : p.linksFilter?.length ? <><Filterkaesten bedingung={bed()} arten={arten()} onAendern={setBed} /><Seitenliste art="filter" name="Filter" abschnitte={linksAbschnitte()} aktiv={linksAn} nicht={linksNicht} onWahl={linksWahl} /></> : baumFelder.length ? <Baum titel={`Gliederung ${m.titelMehrzahl}`} knoten={knoten()} gewaehlt={ast()} onWahl={setAst} symbol={a.baumSymbol} /> : undefined}
        inhalt={a.mitte ? a.mitte(mitteP) : a.leer && !lebend().length ? a.leer(fest(), () => neuStart()) : kacheln() && a.kachel ?
          <Kacheln zeilen={zeilen()} gewaehlt={gewaehlt()} leer={leer()} inhalt={a.kachel} breite={a.kachelBreite} onWahl={setGewaehlt} onOeffnen={() => rahmen.detailsZeigen()} /> :
          <Tabelle modell={m} zeilen={zeilen()} onReihe={setReihe} gewaehlt={gewaehlt()} leer={leer()} steuer={(s) => (tabelle = s)} zelle={a.zelle}
            filter={filter()} onFilter={(feld, text) => setFilter((alt) => ({ ...alt, [feld]: text }))} filterWerte={(f) => lebend().map((z) => anzeige(f, roh(z).werte[f.name]))}
            onZelle={darf(m.name, 'schreiben') ? (z, f, w) => feldAendern(m, z, f, w) : undefined}
            onWahl={setGewaehlt} onOeffnen={insErsteFeld} onDoppelklick={a.details ? undefined : (z) => setSchwebend(z.id)} onSuche={() => suchfeld.focus()}
            onLoeschen={darfLoeschen() ? (z) => loesche(m, z) : undefined}
            zeilenMenue={(z) => [
              { titel: 'Öffnen', tun: insErsteFeld },
              { titel: 'In eigenem Fenster öffnen', tun: () => inEigenemFenster(m, z.id) },
              ...(a.zeilenMenue?.(z) ?? []),
              ...(darf(m.name, 'schreiben') ? [{ titel: 'Duplizieren …', tun: () => duplizieren(z) }] : []),
              ...(darfLoeschen() ? [{ titel: 'Löschen', gefahr: true, tun: () => loesche(m, z) }] : []),
            ]} />
        }
        detailsTitel={(karte() && objektname(m, karte()!.werte)) || m.titel}
        detailsHinweis={a.detailsHinweis ?? `${a.mitte ? 'Einen Eintrag' : 'Eine Zeile'} anklicken – hier stehen dann alle Angaben, direkt änderbar.`}
        details={karte() ? (a.details ? a.details(karte()!) : <Show when={karte()}>{(z) => <Detailkarte modell={m} zeile={z()} blaettern={blaettern()} onZu={() => setGewaehlt(null)} heftzwecke={rahmen.heftzweckeRechts()} zusatz={a.kartenZusatz} oben={a.kartenOben} einschub={a.kartenEinschub} reiter={a.kartenReiter} symbole={a.kartenSymbole} verborgen={Object.keys(fest())} />}</Show> ) : undefined} />
      <Show when={schwebZeile()}>{(z) => <Schwebefenster titel={objektname(m, z().werte) || m.titel} onZu={() => { setSchwebend(null); tabelle?.fokus(); }}>
        <Detailkarte modell={m} zeile={z()} onZu={() => setSchwebend(null)} zusatz={a.kartenZusatz} oben={a.kartenOben} einschub={a.kartenEinschub} reiter={a.kartenReiter} symbole={a.kartenSymbole} verborgen={Object.keys(fest())} />
      </Schwebefenster>}</Show>
      <Show when={neu()}>{(start) => <NeuFenster modell={m} start={start()} verborgen={Object.keys(fest())} onZu={(id) => { setNeu(null); if (id) { setGewaehlt(id); rahmen.detailsZeigen(); } }} />}</Show>
    </div>
  );
}
