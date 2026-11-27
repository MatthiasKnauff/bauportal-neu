// Fenster- & Türliste (AVA): aus dem Gebäudemodell füllen, ins LV übernehmen und das LV auf dem Stand der Liste halten.
// Die Rechnung (Gruppen, gleiche Ausführung, Systembeschreibung) steht in module/ava/tueren.ts, das Speisen des LV in lvquelle.tsx.
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { Vorlage, Zeile } from '../kern/befehl';
import { quelleVon } from '../module/ava/lvplan';
import { Auswahlliste } from './baukasten/auswahlliste';
import { Detailkarte } from './baukasten/detailkarte';
import { Dialog } from './baukasten/dialog';
import { Schwebefenster } from './baukasten/schwebefenster';
import { Zeichen } from './baukasten/zeichen';
import { lvAbgleichen, lvName, modellBauteile, neuesLv, offenIm, positionenVon, tuerQuelle } from './lvquelle';
import { springeZu } from './sprung';
import { tuerPruefen } from '../module/ava/tuerpruefung';
import { tabelleEinlesen } from './baukasten/tabelleeinlesen';
import { ausfuehrenMehrere, lebende, rueckgaengig, sicht, verlauf } from './unterbau/abgleich';
import { darf, modell, neueKennung } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';

const listenVon = (projekt: string) => lebende('tuerliste').filter((z) => z.werte.projekt === projekt).sort((a, b) => String(a.werte.name).localeCompare(String(b.werte.name), 'de'));
const tuerenVon = (liste: string) => lebende('tuer').filter((z) => z.werte.liste === liste);
/** LVs, in denen schon Zeilen aus dieser Liste stehen. */
const verbundeneLvs = (projekt: string, liste: string) => lebende('lv').filter((l) => l.werte.projekt === projekt && positionenVon(l.id).some((p) => quelleVon(p) === liste));

/** „1,26 × 1,38 m, Brüstung 0,9 m“ → Breite, Höhe, Brüstung in m. */
function masse(t: unknown): { b?: number; h?: number; bruestung?: number } {
  const s = String(t ?? '').replace(/,/g, '.'), m = /([\d.]+)\s*[×x]\s*([\d.]+)/.exec(s), br = /Brüstung\s*([\d.]+)/.exec(s);
  return { ...(m ? { b: Number(m[1]), h: Number(m[2]) } : {}), ...(br ? { bruestung: Number(br[1]) } : {}) };
}

/** Türen und Fenster des Gebäudemodells (gewählte Version) in die Liste – nur die, die noch nicht drinstehen. */
export function ausDemModell(projekt: string, listeGewaehlt?: string): void {
  const bauteile = modellBauteile(projekt).filter((b) => b.werte.art === 'tuer' || b.werte.art === 'fenster');
  if (!bauteile.length) { hinweis('Im Gebäudemodell gibt es keine Türen und Fenster (IFC einlesen oder Bauteile anlegen).', { art: 'fehler' }); return; }
  const befehle: Vorlage[] = [];
  let liste = listeGewaehlt ?? listenVon(projekt)[0]?.id;
  if (!liste) { liste = neueKennung(); befehle.push({ objekt: 'tuerliste', art: 'anlegen', objektId: liste, werte: { projekt, name: 'Fenster- & Türliste' } }); }
  const schon = new Set(lebende('tuer').filter((t) => t.werte.liste === liste).map((t) => t.werte.bauteil));
  const geschoss = (id: unknown) => String(sicht.geschoss?.[String(id ?? '')]?.werte.name ?? '');
  const neu = bauteile.filter((b) => !schon.has(b.id)).sort((a, b) => geschoss(a.werte.geschoss).localeCompare(geschoss(b.werte.geschoss), 'de', { numeric: true }) || String(a.werte.name).localeCompare(String(b.werte.name), 'de'));
  if (!neu.length) { hinweis('Alle Türen und Fenster des Gebäudemodells stehen schon in der Liste.'); return; }
  const zaehler = { F: tuerenVon(liste).filter((t) => /^F/i.test(String(t.werte.nr ?? ''))).length, T: tuerenVon(liste).filter((t) => /^T/i.test(String(t.werte.nr ?? ''))).length };
  for (const b of neu) {
    const fenster = b.werte.art === 'fenster', k = fenster ? 'F' : 'T';
    befehle.push({ objekt: 'tuer', art: 'anlegen', objektId: neueKennung(), werte: {
      projekt, liste, bauteil: b.id, nr: `${k}${String(++zaehler[k]).padStart(2, '0')}`, geschoss: geschoss(b.werte.geschoss), anzahl: Number(b.werte.menge ?? 1) || 1,
      art: fenster ? 'Fenster' : b.werte.lage === 'aussen' ? 'Außentür' : 'Innentür', ...masse(b.werte.abmessung),
    } });
  }
  ausfuehrenMehrere(befehle, `${neu.length} Türen/Fenster aus dem Gebäudemodell`);
  hinweis(`${neu.length} ${neu.length === 1 ? 'Tür/Fenster' : 'Türen und Fenster'} aus dem Gebäudemodell übernommen – Ausführung jetzt in der Liste ergänzen.`);
}

const quelle = (liste: string) => tuerQuelle(sicht.tuerliste![liste]!);
/** Wie weit die verbundenen LVs vom Stand der Liste abweichen (für den Hinweis über der Liste). */
export const lvStand = (projekt: string, liste: string): { lv: Zeile; offen: number }[] => verbundeneLvs(projekt, liste).map((lv) => ({ lv, offen: offenIm(lv, quelle(liste)) }));

/** Die Reiter über der Tabelle wie bisher (Übersicht, Maße & Fenster, Ausführung, Anforderungen & Beschlag, Alle Spalten). */
export const TUER_SAETZE = [
  { id: 'uebersicht', titel: 'Übersicht', spalten: ['nr', 'geschoss', 'raum', 'raumname', 'art', 'anzahl', 'flg', 'din', 'b', 'h', 'wand', 'brand', 'schall', 'ausstattung', 'bem'] },
  { id: 'masse', titel: 'Maße & Fenster', spalten: ['nr', 'geschoss', 'raum', 'typ', 'art', 'anzahl', 'b', 'h', 'wand', 'bruestung', 'oeffnung', 'fb_innen', 'fb_aussen', 'rollo', 'glas'] },
  { id: 'ausfuehrung', titel: 'Ausführung', spalten: ['nr', 'geschoss', 'raum', 'art', 'zarge', 'blatt', 'oberfl', 'farbe', 'glas', 'ausstattung'] },
  { id: 'anforderungen', titel: 'Anforderungen & Beschlag', spalten: ['nr', 'geschoss', 'raum', 'art', 'brand', 'schall', 'rc', 'klima', 'schloss', 'beschlag', 'ausstattung'] },
  { id: 'alle', titel: 'Alle Spalten', spalten: ['nr', 'geschoss', 'raum', 'raumname', 'zu', 'typ', 'anzahl', 'art', 'flg', 'din', 'b', 'h', 'wand', 'bruestung', 'oeffnung', 'fb_innen', 'fb_aussen', 'rollo',
    'zarge', 'blatt', 'oberfl', 'farbe', 'glas', 'brand', 'schall', 'rc', 'klima', 'schloss', 'beschlag', 'ausstattung', 'bem'] },
];
const [insLvOffen, setInsLvOffen] = createSignal(false);
// Die gewählte Liste je Projekt (wie bisher gemerkt); ohne Wahl die erste
const [listeWahl, setListeWahl] = createSignal<Record<string, string>>((() => { try { return JSON.parse(localStorage.getItem('bp_tuerliste_wahl') ?? '{}') as Record<string, string>; } catch { return {}; } })());
export const gewaehlteListe = (projekt: string): string | undefined => { const l = listenVon(projekt); return l.find((x) => x.id === listeWahl()[projekt])?.id ?? l[0]?.id; };
const listeWaehlen = (projekt: string, id: string) => { const n = { ...listeWahl(), [projekt]: id }; setListeWahl(n); try { localStorage.setItem('bp_tuerliste_wahl', JSON.stringify(n)); } catch { /* egal */ } };
const listeNeu = (projekt: string) => {
  const id = neueKennung(), n = listenVon(projekt).length;
  ausfuehrenMehrere([{ objekt: 'tuerliste', art: 'anlegen', objektId: id, werte: { projekt, name: n ? `Türliste ${n + 1}` : 'Fenster- & Türliste' } }], 'Neue Türliste');
  listeWaehlen(projekt, id);
};
/** Nr. hochzählen wie bisher: „T 07“ → „T 08“, „F01a“ bleibt ohne Zahl am Ende leer. */
export const naechsteNr = (nr: unknown) => { const m = /^(.*?)(\d+)(\D*)$/.exec(String(nr ?? '')); return m ? m[1]! + String(Number(m[2]) + 1).padStart(m[2]!.length, '0') + m[3]! : ''; };
/** Neue Zeile wie bisher: die Ausführung der letzten Zeile, Nr. hochgezählt, Raum und Bemerkung leer. */
export const neueZeileVorgabe = (vorhandene: Zeile[]): Record<string, string | number | boolean | null> => {
  const letzte = [...vorhandene].sort((a, b) => String(a.werte.nr ?? '').localeCompare(String(b.werte.nr ?? ''), 'de', { numeric: true })).at(-1);
  if (!letzte) return { anzahl: 1 };
  const { nr, raum: _r, raumname: _n, zu: _z, bem: _b, bauteil: _t, projekt: _p, liste: _l, ...ausfuehrung } = letzte.werte;
  return { ...(ausfuehrung as Record<string, string | number | boolean | null>), nr: naechsteNr(nr) };
};
/** Stückzahl einer Liste (Anzahl je Zeile, mindestens 1). */
const stueck = (zeilen: Zeile[]) => zeilen.reduce((s, z) => s + Math.max(1, Number(z.werte.anzahl ?? 1) || 1), 0);

/** Die Knöpfe der Ansicht (Menüleiste) – wie bisher rechts die Liste selbst löschen. */
export const tuerKnoepfe = (projekt: string) => [
  // Import wie bisher: Excel/CSV mit Spaltenzuordnung in die gewählte Liste (Baustein „Tabelle einlesen“)
  ...(darf('tuer', 'schreiben') && gewaehlteListe(projekt) ? [{ titel: 'Import', zeichen: 'import', gruppe: 'Datei', rechts: true,
    tun: () => tabelleEinlesen({ modell: modell('tuer'), felder: TUER_SAETZE.at(-1)!.spalten.map((n) => modell('tuer').felder.find((f) => f.name === n)!).filter(Boolean), fest: { projekt, liste: gewaehlteListe(projekt)! },
      vorschau: ['nr', 'geschoss', 'raumname', 'art', 'anzahl', 'b', 'h', 'brand'] }) }] : []),
  ...(darf('tuerliste', 'loeschen') && gewaehlteListe(projekt) ? [{ titel: 'Löschen', zeichen: 'loeschen', rot: true, gruppe: 'Türliste', rechts: true, tun: () => listeLoeschen(projekt) }] : []),
];
const listeLoeschen = (projekt: string) => {
  const id = gewaehlteListe(projekt); if (!id) return;
  const l = sicht.tuerliste![id]!, zeilen = tuerenVon(id);
  ausfuehrenMehrere([...zeilen.map((z) => ({ objekt: 'tuer', art: 'loeschen' as const, objektId: z.id, werte: {} })), { objekt: 'tuerliste', art: 'loeschen', objektId: id, werte: {} }],
    `Liste „${String(l.werte.name)}“ löschen`);
  hinweis(`„${String(l.werte.name)}“ mit ${zeilen.length} ${zeilen.length === 1 ? 'Zeile' : 'Zeilen'} gelöscht – Rückgängig holt sie zurück. Positionen im LV bleiben.`);
};

/** Über der Tabelle wie bisher: die Listen des Projekts als Reiter (+ Liste, Umbenennen, Liste löschen), darunter die LVs, die aus der
 *  Liste gespeist werden, und die Knöpfe der Liste (Stückzahl, Aus dem Gebäudemodell, In LV übernehmen). */
export function TuerlisteOben(p: { projekt: string }) {
  const liste = () => gewaehlteListe(p.projekt);
  const stand = createMemo(() => (liste() ? lvStand(p.projekt, liste()!) : []));
  const [umbenennen, setUmbenennen] = createSignal(false);
  const zeilen = () => (liste() ? tuerenVon(liste()!) : []);
  const schreiben = () => darf('tuer', 'schreiben');
  const befunde = createMemo(() => { const alle = zeilen().map((z) => z.werte); return zeilen().map((z) => ({ z, b: tuerPruefen(z.werte, alle) })).filter((x) => x.b.length)
    .sort((a, b) => String(a.z.werte.nr ?? '').localeCompare(String(b.z.werte.nr ?? ''), 'de', { numeric: true })); });
  const warnungen = () => befunde().reduce((n, x) => n + x.b.filter((y) => y.stufe === 'warnung').length, 0);
  const [pruefOffen, setPruefOffen] = createSignal(false);
  const [raeumeOffen, setRaeumeOffen] = createSignal(false);
  return (<>
    <Show when={raeumeOffen() && liste()}><AusRaeumen projekt={p.projekt} liste={liste()!} zu={() => setRaeumeOffen(false)} /></Show>
    <Show when={pruefOffen()}>
      <Dialog titel="Plausibilität der Fenster- & Türliste" onAbbrechen={() => setPruefOffen(false)} knoepfe={<button class="knopf" onClick={() => setPruefOffen(false)}>Schließen</button>}>
        <p class="still-text">{befunde().length ? `${befunde().length} von ${zeilen().length} Zeilen mit Hinweisen${warnungen() ? `, davon ${warnungen()} Warnungen` : ''}. Zeile anklicken springt in die Liste.` : `Alle ${zeilen().length} Zeilen sind plausibel.`}</p>
        <div class="tl-pruefung">
          <For each={befunde()}>{(x) => <button type="button" class="tl-befund" onClick={() => { setPruefOffen(false); springeZu('tuer', x.z.id, { modul: 'ava', ansicht: 'tueren' }); }}>
            <b>{String(x.z.werte.nr || '–')}</b> <span class="still-text">{[x.z.werte.geschoss, x.z.werte.raumname || x.z.werte.raum, x.z.werte.art].filter(Boolean).join(' · ')}</span>
            <For each={x.b}>{(y) => <span classList={{ warnung: y.stufe === 'warnung', hinweis: y.stufe === 'hinweis' }}>{y.stufe === 'warnung' ? '⚠' : 'ℹ'} {y.text}</span>}</For>
          </button>}</For>
        </div>
      </Dialog>
    </Show>
    <Show when={insLvOffen()}><InsLv projekt={p.projekt} liste={liste()} zu={() => setInsLvOffen(false)} /></Show>
    <div class="tl-listen" role="tablist" aria-label="Fenster- & Türlisten">
      <For each={listenVon(p.projekt)}>{(l) => <button type="button" role="tab" aria-label={`Liste ${String(l.werte.name)} – ${tuerenVon(l.id).length} Zeilen`} aria-selected={l.id === liste()} classList={{ aktiv: l.id === liste() }} onClick={() => listeWaehlen(p.projekt, l.id)}>
        {String(l.werte.name)} <small>{tuerenVon(l.id).length}</small></button>}</For>
      <Show when={darf('tuerliste', 'schreiben')}><button type="button" class="tl-plus" title="Weitere Liste anlegen (z. B. je Bauteil, Bauabschnitt oder Stand)" onClick={() => listeNeu(p.projekt)}>＋ Liste</button></Show>
      <span class="abstand" />
      <Show when={liste() && darf('tuerliste', 'schreiben')}><button type="button" class="knopf klein" onClick={() => setUmbenennen(true)}><Zeichen name="bearbeiten" groesse={14} /> Umbenennen</button></Show>
      <Show when={liste() && darf('tuerliste', 'loeschen')}><button type="button" class="knopf klein gefahr" onClick={() => listeLoeschen(p.projekt)}>Liste löschen</button></Show>
    </div>
    <Show when={umbenennen() && liste()}><Schwebefenster titel="Liste umbenennen" onZu={() => setUmbenennen(false)}>
      <Detailkarte modell={modell('tuerliste')} zeile={sicht.tuerliste![liste()!]!} ohneKopf ohneRahmen bestaetigen onZu={() => setUmbenennen(false)} verborgen={['projekt']} />
    </Schwebefenster></Show>
    <Show when={stand().length}>
      <div class="hinweis-leiste">
        <For each={stand()}>{(s) => (
          <span>LV {lvName(s.lv)}: {s.offen ? `${s.offen} ${s.offen === 1 ? 'Änderung' : 'Änderungen'} aus der Liste noch nicht im LV` : 'auf dem Stand der Liste'}
            <Show when={s.offen && darf('lv_position', 'schreiben')}> <button type="button" class="knopf klein" onClick={() => lvAbgleichen(s.lv, quelle(liste()!))}>Abgleichen</button></Show>
            {' '}<button type="button" class="knopf klein still" onClick={() => springeZu('lv', s.lv.id, { modul: 'ava', ansicht: 'lv' })}>Zum LV</button></span>)}</For>
      </div>
    </Show>
    <div class="tl-leiste">
      <Show when={!liste() && darf('tuerliste', 'schreiben')}><button type="button" class="knopf haupt klein" onClick={() => listeNeu(p.projekt)}>Liste anlegen</button></Show>
      {/* legt die Liste selbst an, wenn es noch keine gibt */}
      <Show when={schreiben()}><button type="button" class="knopf klein" title="Türen und Fenster des Gebäudemodells in die Liste – nur die, die noch nicht drinstehen" onClick={() => ausDemModell(p.projekt, liste())}>Aus dem Gebäudemodell</button></Show>
      <Show when={liste() && schreiben()}><button type="button" class="knopf klein" title="Für Räume des Gebäudemodells (Raumbuch) je eine Tür anlegen" onClick={() => setRaeumeOffen(true)}>Aus den Räumen …</button></Show>
      <span class="abstand" />
      <Show when={liste()}><span class="still-text">{zeilen().length} {zeilen().length === 1 ? 'Zeile' : 'Zeilen'} · {stueck(zeilen())} Stück</span></Show>
      <Show when={zeilen().length}><button type="button" class="knopf klein" classList={{ warnung: warnungen() > 0 }} title="Plausibilität prüfen: fehlende Angaben, ungewöhnliche Maße, 2. Rettungsweg, Absturzsicherung, Brandschutz …" onClick={() => setPruefOffen(true)}>{warnungen() ? `⚠ ${warnungen()} prüfen` : '✓ Prüfen'}</button></Show>
      <Show when={liste() && zeilen().length && darf('lv_position', 'schreiben')}><button type="button" class="knopf haupt klein" onClick={() => setInsLvOffen(true)}>→ In LV übernehmen …</button></Show>
    </div>
  </>);
}

/** Aus dem Raumbuch wie bisher: je gewähltem Raum des Gebäudemodells eine Tür (Nr. = Raumnummer); Räume mit Tür sind abgewählt. */
function AusRaeumen(p: { projekt: string; liste: string; zu: () => void }) {
  const raeume = createMemo(() => { const ids = new Set(modellBauteile(p.projekt).map((b) => b.werte.version)); const geschoss = (id: unknown) => String(sicht.geschoss?.[String(id ?? '')]?.werte.name ?? '');
    return lebende('raum').filter((r) => r.werte.projekt === p.projekt && (!ids.size || ids.has(r.werte.version))).map((r) => ({ id: r.id, nr: String(r.werte.nummer ?? ''), name: String(r.werte.name ?? ''), geschoss: geschoss(r.werte.geschoss) }))
      .sort((a, b) => a.geschoss.localeCompare(b.geschoss, 'de', { numeric: true }) || a.nr.localeCompare(b.nr, 'de', { numeric: true })); });
  const schon = new Set(tuerenVon(p.liste).map((t) => String(t.werte.raum ?? '')).filter(Boolean));
  const [gewaehlt, setGewaehlt] = createSignal(new Set(raeume().filter((r) => !schon.has(r.nr)).map((r) => r.id)));
  const schalten = (id: string) => { const n = new Set(gewaehlt()); if (n.has(id)) n.delete(id); else n.add(id); setGewaehlt(n); };
  const anlegen = () => {
    const neu = raeume().filter((r) => gewaehlt().has(r.id));
    ausfuehrenMehrere(neu.map((r) => ({ objekt: 'tuer', art: 'anlegen' as const, objektId: neueKennung(), werte: { projekt: p.projekt, liste: p.liste, nr: r.nr, raum: r.nr, raumname: r.name, geschoss: r.geschoss, art: 'Innentür', flg: '1-flg.', anzahl: 1 } })),
      `${neu.length} Türen aus den Räumen`);
    hinweis(`${neu.length} ${neu.length === 1 ? 'Tür' : 'Türen'} angelegt.`); p.zu();
  };
  return (
    <Dialog titel="Türen aus den Räumen" onAbbrechen={p.zu} knoepfe={<><button class="knopf" onClick={p.zu}>Abbrechen</button><button class="knopf haupt" disabled={!gewaehlt().size} onClick={anlegen}>Türen anlegen</button></>}>
      <Show when={raeume().length} fallback={<p class="still-text">Im Gebäudemodell stehen noch keine Räume (IFC einlesen oder Räume anlegen).</p>}>
        <p class="still-text">Für jeden gewählten Raum wird eine Tür angelegt (Nr. = Raumnummer). Räume, die schon eine Tür haben, sind abgewählt.</p>
        <label class="haken-zeile"><input type="checkbox" checked={gewaehlt().size === raeume().length} onChange={(e) => setGewaehlt(new Set(e.currentTarget.checked ? raeume().map((r) => r.id) : []))} /> alle</label>
        <div class="tl-raeume"><For each={raeume()}>{(r) => <label class="haken-zeile"><input type="checkbox" checked={gewaehlt().has(r.id)} onChange={() => schalten(r.id)} /> {r.nr} {r.name} <span class="still-text">{r.geschoss}</span></label>}</For></div>
      </Show>
    </Dialog>
  );
}

/** „Ins LV“: an ein LV anhängen (oder es angleichen, wenn es schon Positionen aus der Liste hat) oder ein neues LV anlegen. */
export function InsLv(p: { projekt: string; liste?: string; zu: () => void }) {
  const listen = () => listenVon(p.projekt);
  const [liste, setListe] = createSignal(p.liste ?? listen()[0]?.id ?? '');
  const lvs = () => lebende('lv').filter((l) => l.werte.projekt === p.projekt && String(l.werte.status ?? 'bearbeitung') === 'bearbeitung');
  const [ziel, setZiel] = createSignal<string>(verbundeneLvs(p.projekt, liste())[0]?.id ?? '');
  const tueren = () => tuerenVon(liste());
  const plan = createMemo(() => (liste() ? quelle(liste()).plan() : []));
  // die Optionen (Felder der Liste) ändern sich sofort – Abbrechen nimmt sie zurück
  const start = verlauf().zurueck, schritte = () => Math.max(0, verlauf().zurueck - start);
  const abbrechen = () => { for (let i = schritte(); i > 0; i--) rueckgaengig(); p.zu(); };
  const ok = () => {
    if (!tueren().length) { hinweis('In der Liste stehen noch keine Türen.', { art: 'fehler' }); return; }
    p.zu();
    if (ziel()) { lvAbgleichen(sicht.lv![ziel()]!, quelle(liste())); return; }
    const lv = neuesLv(p.projekt, 'Fenster und Türen');
    lvAbgleichen(lv, quelle(liste()), undefined, [{ objekt: 'lv', art: 'anlegen', objektId: lv.id, werte: lv.werte }]);
    springeZu('lv', lv.id, { modul: 'ava', ansicht: 'lv' });
  };
  return (
    <Dialog titel="Ins LV übernehmen" onAbbrechen={abbrechen} geaendert={() => schritte() > 0}
      knoepfe={<><button class="knopf" data-abbrechen onClick={abbrechen}>Abbrechen</button><button class="knopf haupt" disabled={!tueren().length} onClick={ok}>Übernehmen</button></>}>
      <div class="formular">
        <Show when={listen().length > 1}><Auswahlliste titel="Liste" wert={liste()} optionen={listen().map((l) => ({ wert: l.id, titel: String(l.werte.name) }))} onWert={(w) => { setListe(w); setZiel(verbundeneLvs(p.projekt, w)[0]?.id ?? ''); }} /></Show>
        <Auswahlliste titel="Ziel" wert={ziel()} onWert={setZiel}
          optionen={[{ wert: '', titel: 'Neues LV „Fenster und Türen“ anlegen' }, ...lvs().map((l) => ({ wert: l.id, titel: `${verbundeneLvs(p.projekt, liste()).some((x) => x.id === l.id) ? 'angleichen' : 'anhängen an'}: LV ${[l.werte.nummer, l.werte.name].filter(Boolean).join(' · ')}` }))]} />
        <Show when={sicht.tuerliste?.[liste()]}>{(l) => <Detailkarte modell={modell('tuerliste')} zeile={l()} ohneKopf ohneRahmen nurGruppen={['Ins LV']} />}</Show>
        <p class="still-text">{tueren().length} Türen/Fenster → {plan().filter((z) => z.art === 'normal').length} Positionen. Gleiche Ausführung wird eine Position (Menge = Stückzahl); je Gruppe (Fenster, Außentüren, Innentüren) ein Titel mit Systembeschreibung. Angleichen: geänderte Mengen und Texte werden angepasst, neue Ausführungen kommen dazu, weggefallene bekommen Menge 0 – OZ, Preise und Vergabe bleiben.</p>
      </div>
    </Dialog>
  );
}
