// Baustein „Wahltabelle“: Einträge einer Liste mit den bekannten Filtern (Abschnitte links, Suchfeld mit Vorschlägen,
// Spaltenköpfe – Baustein Objektfilter) anhaken und übernehmen – z. B. Bieter:innen aus den Adressen. Steht dort, wo man
// gerade ist (kein eigenes Fenster); „Übernehmen“ und „Abbrechen“ schließen sie wieder.
import { Show, createMemo, createSignal, type JSX } from 'solid-js';
import { unwrap } from 'solid-js/store';
import type { ObjektModell } from '../../kern/modell';
import type { Zeile } from '../../kern/befehl';
import { sammelfilter, type LinksFilter } from '../../kern/modul';
import { objektFilter } from './objektfilter';
import { enthaeltDazu } from '../../kern/filterbedingung';
import { Filterkaesten, Filtersuche } from './filterkaesten';
import { Seitenliste } from './seitenliste';
import { Tabelle, type Sortierung } from './tabelle';
import { auswahlAnlegen } from './auswahl';
import { anzeige } from './feld';
import { lebende } from '../unterbau/abgleich';

export function Wahltabelle(p: {
  schluessel: string; modell: ObjektModell;
  linksFilter?: LinksFilter[]; suchArten?: { titel: string; felder: string[] }[];
  /** nur diese Einträge stehen zur Wahl (z. B. ohne die schon gewählten, ohne Personen) */
  nur?: (z: Zeile) => boolean;
  /** oben einsortiert (z. B. Firmen mit passendem Gewerk) */
  zuerst?: (z: Zeile) => boolean;
  titel: string; knopf: (n: number) => string; hinweis?: JSX.Element;
  projektId?: () => string | null | undefined;   // das gewählte Projekt (Filter „Beteiligte“)
  start?: { feld: string; werte: string[] }[];     // Filter zu Beginn (z. B. Art = Firmen)
  onUebernehmen: (ids: string[]) => void; onAbbrechen: () => void;
}): JSX.Element {
  const m = p.modell;
  const lebend = createMemo(() => lebende(m.name).filter((z) => !p.nur || p.nur(z)));
  const lfs = p.linksFilter ?? sammelfilter(m, []);
  const f = objektFilter({ schluessel: p.schluessel, modell: m, lfs, suchArten: p.suchArten, lebend, projektId: () => p.projektId?.(), start: p.start });
  const [sort, setSort] = createSignal<Sortierung>({ feld: m.sortierFeld ?? m.anzeigeFeld, ab: false });
  const zeilen = createMemo(() => { const l = f.filtern(lebend()); return p.zuerst ? [...l.filter(p.zuerst), ...l.filter((z) => !p.zuerst!(z))] : l; });
  const auswahl = auswahlAnlegen();
  const [dazu, setDazu] = createSignal('');
  return (
    <section class="wahltabelle" aria-label={p.titel}>
      <div class="wt-kopf">
        <strong>{p.titel}</strong>
        <Filtersuche text={f.suche()} onText={f.setSuche} arten={f.arten()} ids={() => lebend().map((z) => z.id)} onNehmen={f.nimm} platzhalter={`${m.titelMehrzahl} durchsuchen und filtern`} onWeiter={() => undefined}
          onEnthaelt={(art, t) => f.setBed(enthaeltDazu(f.bed(), art, t))} />
        <span class="zaehler">{zeilen().length === lebend().length ? `${lebend().length} ${m.titelMehrzahl}` : `${zeilen().length} von ${lebend().length}`}</span>
      </div>
      <div class="wt-koerper">
        <aside class="wt-links" aria-label="Filter">
          <Filtersuche text={dazu()} onText={setDazu} arten={f.arten()} ids={() => lebend().map((z) => z.id)} onNehmen={f.nimm} onEnthaelt={(art, t) => f.setBed(enthaeltDazu(f.bed(), art, t))} onWeiter={() => undefined} platzhalter="Filter hinzufügen …" name="Filter hinzufügen" />
          <Filterkaesten bedingung={f.bed()} arten={f.arten()} onAendern={f.setBed} />
          <Seitenliste art="filter" name="Filter" abschnitte={f.linksAbschnitte()} aktiv={f.linksAn} nicht={f.linksNicht} onWahl={f.linksWahl} />
        </aside>
        <div class="wt-mitte">
          <Tabelle modell={m} zeilen={zeilen()} sort={sort} onSort={setSort} gewaehlt={null} leer="Kein Treffer für diese Auswahl." auswahl={auswahl}
            filter={f.entwurf()} onFilter={(feld, text) => f.setEntwurf({ ...f.entwurf(), [feld]: text })} onFilterFest={f.spalteFest} filterWerte={(x) => lebend().map((z) => anzeige(x, unwrap(z).werte[x.name]))}
            onWahl={(id) => id && auswahl.umschalten(id)} />
        </div>
      </div>
      <div class="wt-fuss">
        <Show when={p.hinweis}><span class="still-text klein-text">{p.hinweis}</span></Show>
        <span class="wt-knoepfe">
          <button type="button" class="knopf" onClick={() => p.onAbbrechen()}>Abbrechen</button>
          <button type="button" class="knopf haupt" disabled={!auswahl.anzahl()} onClick={() => p.onUebernehmen([...auswahl.ids()])}>{p.knopf(auswahl.anzahl())}</button>
        </span>
      </div>
    </section>
  );
}
