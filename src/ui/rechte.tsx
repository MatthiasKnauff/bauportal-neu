// Verwaltung → Rollen & Rechte (Entscheidung 28.11.2026, verglichen mit dem bisherigen Bauportal):
// - Rollen × Rechte: je Rolle und App „an · nur lesen · aus“, aufklappbar je Art von Eintrag sehen · ändern · löschen; „Alle Projekte sehen“
// - Wer darf was?: Personen × dieselben Zeilen – ein Klick ist eine Ausnahme nur für diese Person (＋ zusätzlich, − entzogen), stimmt sie
//   wieder mit der Rolle überein, verschwindet sie
// - Verwaltung: je Rolle und Bereich „– · sehen · ändern“ (Zugänge: „neu setzen“) – dieselben Knöpfe stehen als „Wer darf hier hinein?“
//   oben auf jeder Seite der Verwaltung
// Rollen lassen sich anlegen (als Kopie einer vorhandenen), umbenennen (Karte) und löschen, solange niemand sie hat.
// Alles sind Befehle auf „rolle“ und „recht“ – Rückgängig wie überall; entschieden wird in der Datenbank (bp_darf).
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { Vorlage, Zeile } from '../kern/befehl';
import type { Bereich, Beipackzettel } from '../kern/modul';
import type { ObjektModell, Rechtart } from '../kern/modell';
import { ADMIN_ROLLE, ROLLEN } from '../kern/rechte';
import { ausfuehrenMehrere, gemerkt, lebende, sicht } from './unterbau/abgleich';
import { istAdmin, modell, neueKennung, zustand } from './unterbau/api';
import { Dialog } from './baukasten/dialog';
import { Auswahlliste } from './baukasten/auswahlliste';
import { inEigenemFenster } from './baukasten/detailkarte';
import { FeldEingabe } from './baukasten/feld';

const ARTEN: { art: Rechtart; titel: string }[] = [{ art: 'lesen', titel: 'Sehen' }, { art: 'schreiben', titel: 'Ändern' }, { art: 'loeschen', titel: 'Löschen' }];
type Stand = { lesen: boolean; schreiben: boolean; loeschen: boolean };
const NIX: Stand = { lesen: false, schreiben: false, loeschen: false };
const NUR_ADMIN = new Set(['benutzer', 'recht', 'rolle']);   // ändert immer nur die Administrator:in (Datenbank)

/** Rollen in der Reihenfolge ab Werk, eigene dahinter – ohne Administrator:in (darf immer alles). */
export const rollenListe = () => lebende('rolle').filter((r) => r.id !== ADMIN_ROLLE)
  .sort((a, b) => (ROLLEN.findIndex((x) => x.id === a.id) + 1 || 99) - (ROLLEN.findIndex((x) => x.id === b.id) + 1 || 99) || String(a.werte.titel).localeCompare(String(b.werte.titel), 'de'));

// Rechte als Verzeichnis „Rolle bzw. Person | Objekt“ – einmal je Änderung gerechnet, nicht je Zelle gesucht (50 ms je Klick)
const verzeichnis = () => gemerkt('recht', 'rechte-verzeichnis', () => new Map(lebende('recht').map((z) => [`${z.werte.benutzer ? `b:${z.werte.benutzer}` : `r:${z.werte.rolle}`}|${z.werte.objekt}`, z])));
const zeileVon = (wer: { rolle?: string; benutzer?: string }, objekt: string): Zeile | undefined => verzeichnis().get(`${wer.benutzer ? `b:${wer.benutzer}` : `r:${wer.rolle}`}|${objekt}`);
const standVon = (z: Zeile | undefined): Stand => (z ? { lesen: z.werte.lesen === true, schreiben: z.werte.schreiben === true, loeschen: z.werte.loeschen === true } : NIX);
const gleich = (a: Stand, b: Stand) => a.lesen === b.lesen && a.schreiben === b.schreiben && a.loeschen === b.loeschen;

/** Wer: eine Rolle oder eine Person (dann gilt ihre Ausnahme, sonst ihre Rolle). */
type Wer = { rolle: string; benutzer?: string };
const gilt = (w: Wer, objekt: string): Stand => standVon((w.benutzer ? zeileVon(w, objekt) : undefined) ?? zeileVon({ rolle: w.rolle }, objekt));
const ausnahme = (w: Wer, objekt: string) => !!w.benutzer && !!zeileVon(w, objekt);

/** Befehle, die für „wer“ beim Objekt den Stand „neu“ herstellen – bei einer Person als Ausnahme, die verschwindet, wenn sie der Rolle gleicht. */
function setzen(w: Wer, objekt: string, neu: Stand): Vorlage[] {
  if (w.benutzer) {
    const da = zeileVon(w, objekt), rolle = standVon(zeileVon({ rolle: w.rolle }, objekt));
    if (gleich(neu, rolle)) return da ? [{ objekt: 'recht', art: 'loeschen', objektId: da.id }] : [];
    return da ? (gleich(standVon(da), neu) ? [] : [{ objekt: 'recht', art: 'aendern', objektId: da.id, werte: { ...neu } }])
      : [{ objekt: 'recht', art: 'anlegen', objektId: neueKennung(), werte: { benutzer: w.benutzer, objekt, ...neu } }];
  }
  const da = zeileVon(w, objekt);
  if (da) return gleich(standVon(da), neu) ? [] : [{ objekt: 'recht', art: 'aendern', objektId: da.id, werte: { ...neu } }];
  return [{ objekt: 'recht', art: 'anlegen', objektId: neueKennung(), werte: { rolle: w.rolle, objekt, ...neu } }];
}

// ---------- Apps: an · nur lesen · aus ----------
type AppStufe = 'an' | 'lesen' | 'aus' | 'angepasst';
const STUFEN: { wert: Exclude<AppStufe, 'angepasst'>; titel: string }[] = [{ wert: 'an', titel: 'an' }, { wert: 'lesen', titel: 'nur lesen' }, { wert: 'aus', titel: 'aus' }];
const objekteDer = (m: Beipackzettel) => m.objekte.filter((o) => !NUR_ADMIN.has(o.name));
/** „an“: wie ab Werk für die Rolle (Beipackzettel); für eigene Rollen und wo die Rolle ab Werk nichts ändert: ändern und löschen, was überhaupt jemand darf. */
function anStand(w: Wer, m: Beipackzettel, o: ObjektModell): Stand {
  const k = String(sicht.rolle?.[w.rolle]?.werte.kennung ?? '');
  if (k && objekteDer(m).some((x) => x.rechte.schreiben.includes(k))) return { lesen: true, schreiben: o.rechte.schreiben.includes(k), loeschen: o.rechte.loeschen.includes(k) };
  return { lesen: true, schreiben: o.rechte.schreiben.length > 0, loeschen: o.rechte.loeschen.length > 0 };
}
/** an: alles zu sehen, manches zu ändern · nur lesen: nichts zu ändern · aus: keine Kachel · angepasst: nicht alles zu sehen */
function appStufe(w: Wer, m: Beipackzettel): AppStufe {
  if (!gilt(w, `app:${m.id}`).lesen) return 'aus';
  const s = objekteDer(m).map((x) => gilt(w, x.name));
  if (!s.every((x) => x.lesen)) return 'angepasst';
  return s.some((x) => x.schreiben || x.loeschen) ? 'an' : 'lesen';
}
/** aus: Kachel weg, nichts ändern – sehen bleibt, wo andere Apps die Einträge zeigen (wie bisher: die App ist aus, nicht die Daten). */
function appSetzen(w: Wer, m: Beipackzettel, stufe: Exclude<AppStufe, 'angepasst'>): Vorlage[] {
  const k = gilt(w, `app:${m.id}`);
  return [...setzen(w, `app:${m.id}`, { ...k, lesen: stufe !== 'aus' }),
    ...objekteDer(m).flatMap((o) => setzen(w, o.name, stufe === 'an' ? anStand(w, m, o) : { lesen: stufe === 'lesen' ? true : gilt(w, o.name).lesen, schreiben: false, loeschen: false }))];
}

// ---------- Bereiche der Verwaltung: – · sehen · ändern ----------
type BereichStufe = '' | 'sehen' | 'aendern';
export const bereichStufe = (w: Wer, b: Bereich): BereichStufe => { const s = gilt(w, `bereich:${b.id}`); return s.schreiben ? 'aendern' : s.lesen && b.stufen !== 1 ? 'sehen' : ''; };
export const bereichStufen = (b: Bereich): { wert: BereichStufe; titel: string }[] =>
  [{ wert: '', titel: '–' }, ...(b.stufen === 1 ? [] : [{ wert: 'sehen' as const, titel: 'sehen' }]), ...(b.stufen === 2 ? [] : [{ wert: 'aendern' as const, titel: b.stufen === 1 ? 'neu setzen' : 'ändern' }])];
/** „ändern“ gibt auch das Schreiben der Objekte des Bereichs, „sehen“ das Sehen; „–“ nimmt das Ändern (Sehen bleibt, Ausdrucke brauchen z. B. das Büro). */
export function bereichSetzen(w: Wer, b: Bereich, stufe: BereichStufe): Vorlage[] {
  return [...setzen(w, `bereich:${b.id}`, { lesen: stufe !== '', schreiben: stufe === 'aendern', loeschen: false }),
    ...(b.objekte ?? []).flatMap((o) => { const m = modell(o), s = gilt(w, o);
      return setzen(w, o, stufe === 'aendern' ? { lesen: true, schreiben: true, loeschen: !m.einzeln } : { lesen: stufe === 'sehen' || s.lesen, schreiben: false, loeschen: false }); })];
}
const rolleName = (id: string) => String(sicht.rolle?.[id]?.werte.titel ?? '');
const personName = (id: string) => String(sicht.benutzer?.[id]?.werte.name ?? '');
const tun = (v: Vorlage[], titel: string) => { if (v.length) ausfuehrenMehrere(v, titel); };

/** Knöpfe „– · sehen · ändern“ für eine Rolle und einen Bereich – in der Tabelle und in „Wer darf hier hinein?“. */
export function BereichKnoepfe(p: { rolle: string; bereich: Bereich }) {
  return (
    <div class="auswahl segment klein" role="radiogroup" aria-label={`${rolleName(p.rolle)}: ${p.bereich.titel}`}>
      <For each={bereichStufen(p.bereich)}>{(s) => <button type="button" role="radio" aria-checked={bereichStufe({ rolle: p.rolle }, p.bereich) === s.wert} classList={{ aktiv: bereichStufe({ rolle: p.rolle }, p.bereich) === s.wert }}
        onClick={() => tun(bereichSetzen({ rolle: p.rolle }, p.bereich, s.wert), `${rolleName(p.rolle)}: ${p.bereich.titel} → ${s.titel}`)}>{s.titel}</button>}</For>
    </div>
  );
}

/** Oben auf jeder Seite eines Bereichs der Verwaltung (nur für Administrator:innen, wie bisher): wer darf hier hinein? */
export function WerDarfHier(p: { bereich: string }) {
  const b = () => zustand()!.module.flatMap((m) => m.bereiche ?? []).find((x) => x.id === p.bereich);
  return (
    <Show when={istAdmin() && b()}>{(x) => (
      <details class="wer-darf">
        <summary><b>Wer darf hier hinein?</b> <span class="still-text">{x().titel} – {x().erklaerung}</span></summary>
        <div class="wer-darf-liste"><For each={rollenListe()}>{(r) => <><span>{String(r.werte.titel)}</span><BereichKnoepfe rolle={r.id} bereich={x()} /></>}</For></div>
        <p class="still-text klein-text">Administrator:innen dürfen immer alles. Alle Bereiche auf einen Blick: Rollen &amp; Rechte → Verwaltung.</p>
      </details>
    )}</Show>
  );
}

// ---------- die Seite ----------
type Sicht = 'rollen' | 'personen' | 'verwaltung';
export function Rechte() {
  const [sichtArt, setSicht] = createSignal<Sicht>('rollen');
  const [auf, setAuf] = createSignal(new Set<string>());
  const [neu, setNeu] = createSignal(false);
  const umschalten = (id: string) => setAuf((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const apps = () => zustand()!.module;
  const bereiche = () => zustand()!.module.flatMap((m) => m.bereiche ?? []);
  const personen = createMemo(() => lebende('benutzer').filter((b) => !b.werte.gesperrt && b.werte.rolle !== ADMIN_ROLLE).sort((a, b) => String(a.werte.name).localeCompare(String(b.werte.name), 'de')));
  // Spalten: Rollen oder Personen (mit ihrer Rolle)
  const spalten = (): { wer: Wer; titel: string; unter: string; id: string }[] => sichtArt() === 'personen'
    ? personen().map((b) => ({ wer: { rolle: String(b.werte.rolle), benutzer: b.id }, titel: String(b.werte.name), unter: rolleName(String(b.werte.rolle)), id: b.id }))
    : rollenListe().map((r) => ({ wer: { rolle: r.id }, titel: String(r.werte.titel), unter: `${lebende('benutzer').filter((b) => b.werte.rolle === r.id).length} Personen`, id: r.id }));
  const wer = (w: Wer) => (w.benutzer ? personName(w.benutzer) : rolleName(w.rolle));
  const loeschbar = (r: Zeile) => !ROLLEN.some((x) => x.id === r.id) && !lebende('benutzer').some((b) => b.werte.rolle === r.id);
  const loeschen = (r: Zeile) => tun([{ objekt: 'rolle', art: 'loeschen', objektId: r.id }, ...lebende('recht').filter((z) => z.werte.rolle === r.id).map((z): Vorlage => ({ objekt: 'recht', art: 'loeschen', objektId: z.id }))], `Rolle „${r.werte.titel}“ löschen`);
  const ausnahmeZeichen = (w: Wer, objekte: string[]) => {
    if (!w.benutzer || !objekte.some((o) => ausnahme(w, o))) return '';
    const mehr = objekte.some((o) => { const a = gilt(w, o), r = gilt({ rolle: w.rolle }, o); return (a.lesen && !r.lesen) || (a.schreiben && !r.schreiben) || (a.loeschen && !r.loeschen); });
    return mehr ? '＋' : '−';
  };
  return (
    <section class="blatt">
      <div class="rechte-kopf">
        <div class="auswahl segment" role="radiogroup" aria-label="Ansicht">
          <For each={[['rollen', 'Rollen × Rechte'], ['personen', 'Wer darf was?'], ['verwaltung', 'Verwaltung']] as const}>{([k, t]) =>
            <button type="button" role="radio" aria-checked={sichtArt() === k} classList={{ aktiv: sichtArt() === k }} onClick={() => setSicht(k)}>{t}</button>}</For>
        </div>
        <Show when={istAdmin()}><button type="button" class="knopf" onClick={() => setNeu(true)}>＋ Rolle …</button></Show>
      </div>
      <p class="still-text klein-text">{sichtArt() === 'personen'
        ? 'Ein Klick hier ist eine Ausnahme nur für diese Person (＋ zusätzlich, − entzogen); stimmt sie wieder mit der Rolle überein, gilt wieder die Rolle.'
        : sichtArt() === 'verwaltung' ? '– taucht nicht auf · sehen = nur lesen · ändern. „Zugänge“ = Kennwörter und Schlüssel neu setzen – sehen kann sie niemand.'
          : 'Ein Klick gilt sofort für alle mit dieser Rolle – Rückgängig wie überall. Administrator:innen dürfen immer alles. Klick auf den Namen einer Rolle: umbenennen, erklären, „sieht alle Projekte“.'}</p>
      <div class="tabelle-rollen">
        <table class="matrix rechte">
          <thead><tr><th>{sichtArt() === 'verwaltung' ? 'Bereich' : 'Recht'}</th><For each={spalten()}>{(s) => (
            <th><Show when={sichtArt() !== 'personen' && istAdmin()} fallback={<span>{s.titel}</span>}>
              <button type="button" class="verweis-knopf" title="Rolle bearbeiten" onClick={() => inEigenemFenster(modell('rolle'), s.id)}>{s.titel}</button>
              <Show when={sicht.rolle?.[s.id] && loeschbar(sicht.rolle[s.id]!)}><button type="button" class="knopf klein still" aria-label={`Rolle „${s.titel}“ löschen`} title="Rolle löschen (niemand hat sie)" onClick={() => loeschen(sicht.rolle![s.id]!)}>×</button></Show>
            </Show><small>{s.unter}</small></th>)}</For></tr></thead>
          <tbody>
            <Show when={sichtArt() === 'verwaltung'} fallback={<>
              <Show when={sichtArt() === 'rollen'}>
                <tr><th scope="row">Alle Projekte sehen<small>auch Projekte, in denen die Person nicht Mitglied ist</small></th><For each={spalten()}>{(s) => {
                  const an = () => sicht.rolle?.[s.id]?.werte.alle_projekte === true;
                  return <td><button type="button" role="checkbox" class="haken" classList={{ an: an() }} aria-checked={an()} aria-label={`${s.titel}: alle Projekte sehen`} disabled={!istAdmin()}
                    onClick={() => tun([{ objekt: 'rolle', art: 'aendern', objektId: s.id, werte: { alle_projekte: !an() } }], `${s.titel}: alle Projekte sehen ${an() ? 'aus' : 'an'}`)}>{an() ? '✓' : ''}</button></td>;
                }}</For></tr>
              </Show>
              <tr class="gruppe"><th colSpan={99}>Apps <small>an · nur lesen (sehen, nichts ändern) · aus (keine Kachel, nichts ändern) – ▸ klappt die Arten von Einträgen auf</small></th></tr>
              <For each={apps()}>{(m) => (<>
                <tr>
                  <th scope="row"><button type="button" class="klapp" aria-expanded={auf().has(m.id)} onClick={() => umschalten(m.id)}>{auf().has(m.id) ? '▾' : '▸'}</button> {m.name}</th>
                  <For each={spalten()}>{(s) => (
                    <td><Show when={m.id !== 'verwaltung'} fallback={<small class="still-text">immer da (Für mich) – Bereiche unter „Verwaltung“</small>}><div class="auswahl segment klein" role="radiogroup" aria-label={`${s.titel}: ${m.name}`}>
                      <For each={STUFEN}>{(x) => <button type="button" role="radio" aria-checked={appStufe(s.wer, m) === x.wert} classList={{ aktiv: appStufe(s.wer, m) === x.wert }} disabled={!istAdmin()}
                        onClick={() => tun(appSetzen(s.wer, m, x.wert), `${wer(s.wer)}: ${m.name} ${x.titel}`)}>{x.titel}</button>}</For>
                    </div><Show when={appStufe(s.wer, m) === 'angepasst'}><small class="still-text">angepasst</small></Show></Show>
                    <Show when={ausnahmeZeichen(s.wer, [`app:${m.id}`, ...objekteDer(m).map((o) => o.name)])}>{(z) => <i class="ausnahme" title="Ausnahme für diese Person">{z()}</i>}</Show></td>)}</For>
                </tr>
                <Show when={auf().has(m.id)}>
                  <For each={objekteDer(m)}>{(o) => (
                    <tr class="art"><th scope="row">{o.titelMehrzahl}</th><For each={spalten()}>{(s) => (
                      <td><div class="haken-drei"><For each={ARTEN}>{(a) => {
                        const an = () => gilt(s.wer, o.name)[a.art];
                        const klick = () => { const alt = gilt(s.wer, o.name), n = { ...alt, [a.art]: !alt[a.art] };
                          if (a.art === 'lesen' && alt.lesen) { n.schreiben = false; n.loeschen = false; }   // ohne Sehen kein Ändern
                          if (a.art !== 'lesen' && !alt[a.art]) n.lesen = true;
                          tun(setzen(s.wer, o.name, n), `${wer(s.wer)}: ${o.titelMehrzahl} ${a.titel.toLowerCase()} ${n[a.art] ? 'an' : 'aus'}`); };
                        return <button type="button" role="checkbox" class="haken" classList={{ an: an() }} aria-checked={an()} title={a.titel} aria-label={`${s.titel}: ${o.titelMehrzahl} ${a.titel.toLowerCase()}`} disabled={!istAdmin()} onClick={klick}>{an() ? '✓' : ''}</button>;
                      }}</For></div><Show when={ausnahmeZeichen(s.wer, [o.name])}>{(z) => <i class="ausnahme" title="Ausnahme für diese Person">{z()}</i>}</Show></td>)}</For></tr>
                  )}</For>
                </Show>
              </>)}</For>
            </>}>
              <For each={bereiche()}>{(b) => (
                <tr><th scope="row">{b.titel}<small>{b.erklaerung}</small></th>
                  <For each={spalten()}>{(s) => <td><Show when={istAdmin()} fallback={<span>{bereichStufen(b).find((x) => x.wert === bereichStufe(s.wer, b))?.titel}</span>}><BereichKnoepfe rolle={s.id} bereich={b} /></Show></td>}</For></tr>
              )}</For>
            </Show>
          </tbody>
        </table>
      </div>
      <Show when={neu()}><NeueRolle onZu={() => setNeu(false)} /></Show>
    </section>
  );
}

/** Neue Rolle (wie bisher „+ Rolle“): Name und von welcher Rolle sie die Rechte übernimmt – ein Schritt, ein Rückgängig. */
function NeueRolle(p: { onZu: () => void }) {
  const [titel, setTitel] = createSignal(''), [von, setVon] = createSignal(rollenListe().find((r) => r.id === ROLLEN.find((x) => x.name === 'mitarbeiter')!.id)?.id ?? rollenListe()[0]?.id ?? '');
  const doppelt = () => lebende('rolle').some((r) => String(r.werte.titel).trim().toLowerCase() === titel().trim().toLowerCase());
  const anlegen = () => {
    const t = titel().trim(); if (!t || doppelt()) return;
    const id = neueKennung(), quelle = sicht.rolle?.[von()];
    ausfuehrenMehrere([{ objekt: 'rolle', art: 'anlegen', objektId: id, werte: { titel: t, erklaerung: '', alle_projekte: quelle?.werte.alle_projekte === true, kennung: '' } },
      ...lebende('recht').filter((z) => z.werte.rolle === von() && !z.werte.benutzer).map((z): Vorlage => ({ objekt: 'recht', art: 'anlegen', objektId: neueKennung(),
        werte: { rolle: id, objekt: String(z.werte.objekt), lesen: z.werte.lesen === true, schreiben: z.werte.schreiben === true, loeschen: z.werte.loeschen === true } }))], `Rolle „${t}“ anlegen`);
    p.onZu();
  };
  return (
    <Dialog titel="Neue Rolle" onAbbrechen={p.onZu} geaendert={() => !!titel().trim()} knoepfe={<>
      <button type="button" class="knopf" onClick={p.onZu}>Abbrechen</button>
      <button type="button" class="knopf haupt" disabled={!titel().trim() || doppelt()} onClick={anlegen}>Anlegen</button></>}>
      <FeldEingabe feld={{ name: 'titel', titel: 'Name der Rolle', art: 'text' }} wert={titel()} sofort onWert={(w) => setTitel(String(w ?? ''))} fehler={doppelt() ? 'Eine Rolle mit diesem Namen gibt es schon' : undefined} />
      <label class="feld"><span>Rechte übernehmen von</span>
        <Auswahlliste titel="Rechte übernehmen von" wert={von()} onWert={setVon} optionen={rollenListe().map((r) => ({ wert: r.id, titel: String(r.werte.titel) }))} /></label>
      <p class="still-text klein-text">Die neue Rolle startet mit allen Rechten dieser Rolle; danach in der Tabelle anpassen.</p>
    </Dialog>
  );
}
