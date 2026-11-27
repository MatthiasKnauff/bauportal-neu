// Baustein „Objektfilter“: die Filter einer Liste wie im bisherigen Bauportal – Abschnitte links (Art, Gewerk, Beteiligte …),
// Vorschläge im Suchfeld, Filter aus den Spaltenköpfen, verknüpft mit UND, ODER, NICHT; dazu die Volltextsuche („-wort“ schließt aus).
// Die übliche Ansicht nutzt ihn ebenso wie Listen, aus denen man nur wählt (z. B. Bieter:innen aus den Adressen).
import { createEffect, createMemo, createSignal, on, untrack } from 'solid-js';
import { unwrap } from 'solid-js/store';
import type { Feld, ObjektModell, Werte } from '../../kern/modell';
import { LEER, artWeg, enthaeltDazu, erfuellt, hat, umschalten, werteIn, type Bedingung } from '../../kern/filterbedingung';
import type { Zeile } from '../../kern/befehl';
import type { LinksFilter } from '../../kern/modul';
import type { FilterArt } from './filterkaesten';
import type { SeitenAbschnitt } from './seitenliste';
import { anzeige } from './feld';
import { geaendert, lebende, sicht } from '../unterbau/abgleich';

const vergleich = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });

/** projektId: das oben gewählte Projekt (für „Beteiligte“) – von der Ansicht hereingereicht, der Baukasten kennt die Projektwahl nicht. */
export function objektFilter(o: { schluessel: string; modell: ObjektModell; lfs: LinksFilter[]; suchArten?: { titel: string; felder: string[] }[]; lebend: () => Zeile[]; projektId: () => string | null | undefined;
  /** Start: diese Werte je Feld als Filter (z. B. Art = Firmen); dann beginnt die Liste nicht mit den Beteiligten des Projekts */
  start?: { feld: string; werte: string[] }[] }) {
  const projektId = o.projektId;
  const m = o.modell, lfs = o.lfs, lebend = o.lebend, p = { suchArten: o.suchArten, schluessel: o.schluessel };
  const roh = (z: Zeile) => unwrap(z);
  const [suche, setSuche] = createSignal('');
  const [bed, setBed] = createSignal<Bedingung>(LEER);
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
  const bet = lfs.find((lf) => lf.beteiligt)?.beteiligt;
  const projekteVon = createMemo(() => {
    const k = new Map<string, string[]>();
    if (bet) { geaendert(bet.objekt); for (const x of lebende(bet.objekt)) { const id = String(x.werte[bet.feld] ?? ''), pr = String(x.werte.projekt ?? ''); if (id && pr) (k.get(id) ?? k.set(id, []).get(id)!).push(pr); } }
    return k;
  });
  const projektName = (id: string) => String(sicht.projekt?.[id]?.werte.name ?? '(Projekt nicht sichtbar)');
  const werteVon = (id: string) => roh(sicht[m.name]![id]!).werte;
  const arten = createMemo((): FilterArt[] => [
    ...lfs.map((lf, nr): FilterArt => {
      if (lf.beteiligt) return { key: `l${nr}`, titel: lf.art ?? lf.titel, werte: (id) => projekteVon().get(id) ?? [], wertTitel: projektName };
      const f = feld(lf.feld!);
      return { key: `l${nr}`, titel: lf.art ?? lf.titel, werte: (id) => { const w = werteVon(id); return nurPasst(lf, w) ? liste(f, w[lf.feld!]) : []; }, wertTitel: f.art === 'auswahl' || f.art === 'verweis' ? (w) => anzeige(f, w) || w : undefined };
    }),
    ...(p.suchArten ?? []).map((sa, i): FilterArt => ({ key: `s${i}`, titel: sa.titel, werte: (id) => { const w = werteVon(id); return sa.felder.flatMap((n) => liste(feld(n), w[n])); } })),
    // Filter im Spaltenkopf: je Spalte eine Art („enthält“) – sie stehen links in den Filterkästen und lassen sich dort verknüpfen
    ...m.felder.filter((f) => !f.verborgen).map((f): FilterArt => ({ key: `f:${f.name}`, titel: f.titel, werte: (id) => [anzeige(f, werteVon(id)[f.name])],
      vorschlagen: !lfs.some((lf) => lf.feld === f.name && !lf.nur) })),
  ]);
  // Filterzeile: was gerade getippt wird, filtert schon mit; mit Enter (oder einem Vorschlag) wandert es als fester Filter nach links
  // und kommt dort zu den Werten dieser Spalte dazu (ODER) – das Feld ist dann frei für den nächsten Wert.
  const [entwurf, setEntwurf] = createSignal<Record<string, string>>({});
  const wirksam = createMemo(() => Object.entries(entwurf()).reduce((b, [f, t]) => enthaeltDazu(b, `f:${f}`, t), bed()));
  const spalteFest = (feld: string, text: string) => { setBed(enthaeltDazu(bed(), `f:${feld}`, text)); setEntwurf({ ...entwurf(), [feld]: '' }); };
  const art = (key: string) => arten().find((a) => a.key === key)!;
  const nimm = (key: string, w: string, nicht = false) => setBed(umschalten(bed(), key, w, nicht));
  // Start wie im bisherigen Bauportal: mit den Beteiligten des gewählten Projekts – außer die Person will es ohne
  const betNr = lfs.findIndex((lf) => lf.beteiligt), betKey = `l${betNr}`;
  const OHNE = `bp.ohneProjekt.${p.schluessel}`;
  const [ohneProjekt, setOhneProjekt] = createSignal((() => { try { return localStorage.getItem(OHNE) === 'ja'; } catch { return false; } })());
  const ohneMerken = (an: boolean) => { setOhneProjekt(an); try { localStorage.setItem(OHNE, an ? 'ja' : 'nein'); } catch { /* gilt dann bis zum Neuladen */ } };
  if (o.start?.length) setBed(o.start.reduce((b, s) => { const nr = lfs.findIndex((lf) => lf.feld === s.feld); return nr < 0 ? b : s.werte.reduce((x, w) => umschalten(x, `l${nr}`, w), b); }, bed()));
  if (betNr >= 0 && !o.start?.length) createEffect(on(projektId, (pid, alt) => untrack(() => {
    const drin = werteIn(bed(), betKey);
    const ohne = artWeg(bed(), betKey);
    const hatBeteiligte = !!pid && [...projekteVon().values()].some((l) => l.includes(pid));
    if (alt === undefined) { if (pid && hatBeteiligte && !ohneProjekt()) setBed(umschalten(ohne, betKey, pid)); return; }
    if (drin.length === 1 && drin[0] === alt) setBed(pid && hatBeteiligte ? umschalten(ohne, betKey, pid) : ohne);   // Projekt gewechselt: der Filter zieht mit
  })));
  // Abschnitte links: je Wert die Anzahl; gewählt ist, was in der Bedingung steht
  const linksAbschnitte = createMemo((): SeitenAbschnitt[] => lfs.flatMap((lf, nr): SeitenAbschnitt[] => {
    const key = `l${nr}`, a = art(key);
    const zahl = new Map<string, number>();
    for (const z of lebend()) for (const w of new Set(a.werte(z.id))) zahl.set(w, (zahl.get(w) ?? 0) + 1);
    if (lf.beteiligt) {
      const pid = projektId() && sicht.projekt?.[projektId()!] && !sicht.projekt[projektId()!]!.geloescht ? projektId()! : '';
      const andere = [...zahl.keys()].filter((x) => x !== pid).sort((x, y) => vergleich.compare(projektName(x), projektName(y)));
      return [{ titel: lf.titel, suche: lf.suche && andere.length > 6, zu: !!lf.auto, eintraege: [
        ...(pid ? [{ id: `${nr}:${pid}`, titel: `${lf.beteiligt.titel} ${projektName(pid)}`, anzahl: zahl.get(pid) ?? 0, zeichen: 'projekte',
          nach: <label class="seitenliste-schalter"><input type="checkbox" checked={ohneProjekt()} onChange={(e) => ohneMerken(e.currentTarget.checked)} /> immer ohne Projekt beginnen</label> }] : []),
        ...andere.map((x) => ({ id: `${nr}:${x}`, titel: projektName(x), anzahl: zahl.get(x) ?? 0, zeichen: 'projekte' })),
      ] }];
    }
    const f = feld(lf.feld!);
    const eigene = f.eigeneWerte ? [...zahl.keys()].filter((w) => w && !f.optionen!.some((o) => o.wert === w)).sort((x, y) => vergleich.compare(x, y)) : [];
    const werte = f.art === 'auswahl' ? [...f.optionen!.map((o) => o.wert).filter((w) => w !== ''), ...eigene] : [...zahl.keys()].sort((x, y) => vergleich.compare(anzeige(f, x) || x, anzeige(f, y) || y));
    if (lf.auto && [...zahl.keys()].filter(Boolean).length < 2 && !bed().gruppen.some((g) => g.art === key)) return [];
    return [{ titel: lf.titel, suche: lf.suche, zu: !!lf.auto, eintraege: [
      ...(lf.alle !== undefined ? [{ id: `${nr}:*`, titel: lf.alle, anzahl: lebend().length, zeichen: 'personen' }] : []),
      ...werte.map((w) => ({ id: `${nr}:${w}`, titel: lf.mehrzahl?.[w] ?? (anzeige(f, w) || w), anzahl: zahl.get(w) ?? 0, zeichen: lf.zeichen?.[w] ?? (f.art === 'auswahl' ? undefined : 'liste') })),
    ] }];
  }));
  const linksTeile = (id: string) => { const k = id.indexOf(':'); return { key: `l${id.slice(0, k)}`, w: id.slice(k + 1) }; };
  const linksAn = (id: string) => { const { key, w } = linksTeile(id); return w === '*' ? !bed().gruppen.some((g) => g.art === key) : werteIn(bed(), key).includes(w); };
  const linksNicht = (id: string) => { const { key, w } = linksTeile(id); return w !== '*' && hat(bed(), key, w) && !werteIn(bed(), key).includes(w); };
  const linksWahl = (id: string) => { const { key, w } = linksTeile(id); if (w === '*') setBed(artWeg(bed(), key)); else nimm(key, w); };
  // Text, in dem gesucht wird: einfache Felder direkt, Auswahl/Datum/Verweis so, wie sie angezeigt werden.
  const umgesetzt = m.felder.filter((f) => f.art === 'auswahl' || f.art === 'mehrfach' || f.art === 'datum' || f.art === 'verweis');
  const suchtext = (z: Zeile) => { const w = roh(z).werte; return Object.values(w).join(' ') + ' ' + umgesetzt.map((f) => anzeige(f, w[f.name])).join(' '); };
  // einmal je Datenstand, nicht bei jedem Tastendruck für alle Zeilen neu (Namen verwiesener Einträge folgen über die Abhängigkeit)
  const suchtexte = createMemo(() => new Map(lebend().map((z) => [z.id, suchtext(z).toLowerCase()])));
  /** Die Einträge, die zu Filter und Suche passen. */
  const filtern = (l: Zeile[]): Zeile[] => {
    const b = wirksam();
    if (b.gruppen.length) { const a = new Map(arten().map((x) => [x.key, x])); l = l.filter((z) => erfuellt(b, (k) => a.get(k)?.werte(z.id) ?? [], (k, w) => a.get(k)?.wertTitel?.(w) ?? w)); }
    const worte = suche().toLowerCase().split(/\s+/).filter(Boolean);
    // „-wort“ schließt aus (wie im bisherigen Bauportal)
    if (worte.length) { const texte = suchtexte(); l = l.filter((z) => { const t = texte.get(z.id) ?? ''; return worte.every((w) => (w.startsWith('-') && w.length > 1 ? !t.includes(w.slice(1)) : t.includes(w))); }); }
    return l;
  };
  return { suche, setSuche, bed, setBed, arten, nimm, entwurf, setEntwurf, wirksam, spalteFest, linksAbschnitte, linksAn, linksNicht, linksWahl, filtern, feld };
}
