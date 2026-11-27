// Bauzeitenplan → „Arbeitszeit & Feiertage“ und „Projektinformationen“: zwei Fenster wie im bisherigen Bauportal (links unter
// „Projekt“, öffnen sich über dem Plan). Geändert wird erst im Fenster; OK schreibt alles als einen Schritt (ein Rückgängig),
// Abbrechen verwirft mit Rückfrage. Gibt es noch keinen Kalender für die Version, legt OK ihn an.
import { For, Show, createMemo, createResource, createSignal, type JSX } from 'solid-js';
import type { Vorlage, Zeile } from '../kern/befehl';
import type { Feld, Wert } from '../kern/modell';
import { BUNDESLAENDER, Kalender, isoAus, tagAus, tagname } from '../module/bauzeitenplan/kalender';
import { naechsterMontag } from '../module/bauzeitenplan/plan';
import { Dialog } from './baukasten/dialog';
import { FeldEingabe } from './baukasten/feld';
import { aktuelleVersion, planDerVersion } from './plandaten';
import { projektId } from './projekt';
import { ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { darf, modell, neueKennung, ruf } from './unterbau/api';

const WOCHEN = [{ wert: '5', titel: '5-Tage-Woche (Mo–Fr)' }, { wert: '6', titel: '6-Tage-Woche (Mo–Sa)' }, { wert: '7', titel: '7-Tage-Woche (Mo–So)' }];
const landName = (w: string) => BUNDESLAENDER.find((b) => b.wert === w)?.titel ?? w;
interface Frei { id?: string; von: string | null; bis: string | null; name: string; jaehrlich: boolean }

/** Plan, Version und Kalender des gewählten Projekts – für beide Fenster. */
function planStand() {
  const projekt = () => projektId() ?? '';
  const version = () => (projekt() ? aktuelleVersion(projekt()) : undefined);
  const zp = () => lebende('zeitplan').find((z) => z.werte.projekt === projekt() && z.werte.version === version()?.id);
  const freie = () => lebende('freier_tag').filter((z) => z.werte.projekt === projekt() && z.werte.version === version()?.id);
  const [land] = createResource(projekt, (id) => (id ? ruf<{ land: string }>('/api/projekt/land', { projekt: id }).then((r) => r.land, () => '') : Promise.resolve('')));
  return { projekt, version, zp, freie, land };
}
/** Befehl für den Kalender: ändern, sonst anlegen (mit Projektanfang am nächsten Montag wie ab Werk). */
function kalenderBefehl(s: ReturnType<typeof planStand>, werte: Record<string, Wert>): Vorlage {
  const z = s.zp();
  return z ? { objekt: 'zeitplan', art: 'aendern', objektId: z.id, werte }
    : { objekt: 'zeitplan', art: 'anlegen', objektId: neueKennung(), werte: { projekt: s.projekt(), version: s.version()!.id, anfang: naechsterMontag(new Date().toLocaleDateString('sv')), arbeitswoche: '5', bundesland: '', notiz: '', ...werte } };
}

export function ArbeitszeitFenster(p: { onZu: () => void }): JSX.Element {
  const s = planStand();
  const [woche, setWoche] = createSignal(String(s.zp()?.werte.arbeitswoche ?? '5'));
  const [eigenesLand, setEigenesLand] = createSignal(String(s.zp()?.werte.bundesland ?? ''));   // leer: wie die Baustelle
  const [frei, setFrei] = createSignal<Frei[]>(s.freie().sort((a, b) => String(a.werte.von).localeCompare(String(b.werte.von)))
    .map((z) => ({ id: z.id, von: (z.werte.von as string) ?? null, bis: (z.werte.bis as string) ?? null, name: String(z.werte.name ?? ''), jaehrlich: z.werte.jaehrlich === true })));
  const wirksam = () => eigenesLand() || s.land() || 'DE';
  const feld = (n: string): Feld => ({ ...modell('freier_tag').felder.find((f) => f.name === n)!, titel: '', pflicht: false });   // ohne „Von“ wird die Zeile beim OK nicht übernommen
  const setze = (i: number, w: Partial<Frei>) => setFrei(frei().map((f, k) => (k === i ? { ...f, ...w } : f)));
  const anfang = () => String(s.zp()?.werte.anfang ?? naechsterMontag(new Date().toLocaleDateString('sv')));
  const jahr = () => Number(anfang().slice(0, 4));
  const vorlage = (art: 'weihnachten' | 'feiertage') => setFrei([...frei(), ...(art === 'weihnachten'
    ? [{ von: `${jahr()}-12-24`, bis: `${jahr() + 1}-01-01`, name: 'Weihnachtsferien', jaehrlich: true }]
    : [{ von: `${jahr()}-12-24`, bis: `${jahr()}-12-24`, name: 'Heiligabend', jaehrlich: true }, { von: `${jahr()}-12-31`, bis: `${jahr()}-12-31`, name: 'Silvester', jaehrlich: true }])]);
  // Vorschau wie bisher: arbeitsfreie Tage (Feiertage, eigene) an sonst gearbeiteten Tagen – vom Anfang bis zum Ende, mindestens 60 Tage
  const vorschau = createMemo(() => {
    const k = new Kalender({ anfang: anfang(), arbeitswoche: Number(woche()), land: wirksam(), frei: frei().filter((f) => f.von).map((f) => ({ von: f.von!, bis: f.bis, name: f.name, jaehrlich: f.jaehrlich })) });
    const a = tagAus(anfang()), ende = s.version() ? tagAus(planDerVersion(s.version()!.id).erg.endeDatum) : a, z = Math.max(ende, a + 60);
    const tage: { t: number; name: string }[] = [];
    for (let t = a; t <= z; t++) { const n = k.frei(t); if (n) tage.push({ t, name: n }); }
    return { a, z, tage };
  });
  const geaendert = () => woche() !== String(s.zp()?.werte.arbeitswoche ?? '5') || eigenesLand() !== String(s.zp()?.werte.bundesland ?? '')
    || JSON.stringify(frei()) !== JSON.stringify(s.freie().map((z) => ({ id: z.id, von: z.werte.von ?? null, bis: z.werte.bis ?? null, name: String(z.werte.name ?? ''), jaehrlich: z.werte.jaehrlich === true })));
  const ok = () => {
    const befehle: Vorlage[] = [];
    if (woche() !== String(s.zp()?.werte.arbeitswoche ?? '5') || eigenesLand() !== String(s.zp()?.werte.bundesland ?? '') || !s.zp()) befehle.push(kalenderBefehl(s, { arbeitswoche: woche(), bundesland: eigenesLand() }));
    const da = new Map(s.freie().map((z) => [z.id, z]));
    for (const f of frei().filter((x) => x.von)) {
      const werte = { von: f.von, bis: f.bis || f.von, name: f.name.trim() || 'frei', jaehrlich: f.jaehrlich };
      const alt = f.id ? da.get(f.id) : undefined;
      if (alt) { da.delete(alt.id); if (Object.entries(werte).some(([k, w]) => (alt.werte[k] ?? null) !== w)) befehle.push({ objekt: 'freier_tag', art: 'aendern', objektId: alt.id, werte }); }
      else befehle.push({ objekt: 'freier_tag', art: 'anlegen', objektId: neueKennung(), werte: { projekt: s.projekt(), version: s.version()!.id, ...werte } });
    }
    for (const z of da.values()) befehle.push({ objekt: 'freier_tag', art: 'loeschen', objektId: z.id });
    if (befehle.length) ausfuehrenMehrere(befehle, 'Arbeitszeit & Feiertage');
    p.onZu();
  };
  const schreiben = () => darf('zeitplan', 'schreiben') && darf('freier_tag', 'schreiben');
  return (
    <Dialog titel="Arbeitszeit & Feiertage" breite={860} onAbbrechen={p.onZu} geaendert={geaendert}
      knoepfe={<><button class="knopf" onClick={p.onZu}>Abbrechen</button><button class="knopf haupt" disabled={!s.version() || !schreiben()} onClick={ok}>OK</button></>}>
      <Show when={s.version()} fallback={<p class="still-text">Noch kein Bauzeitenplan in diesem Projekt.</p>}>
        <div class="az">
          <h3 class="az-titel">Arbeitszeit und Feiertage</h3>
          <div class="az-zeile"><span>Arbeitswoche</span>
            <div class="wahl-chips" role="radiogroup" aria-label="Arbeitswoche"><For each={WOCHEN}>{(w) =>
              <button type="button" role="radio" aria-checked={woche() === w.wert} classList={{ aktiv: woche() === w.wert }} disabled={!schreiben()} onClick={() => setWoche(w.wert)}>{w.titel}</button>}</For></div></div>
          <div class="az-zeile"><span>Feiertage</span>
            <div>
              {/* wie bisher: blau „aus Baustelle“, eigene Wahl mit ↺ zurück zur Baustelle */}
              <Show when={eigenesLand()} fallback={<span class="az-quelle">{s.land() ? `aus Baustelle: ${landName(s.land()!)}` : 'Bundesland der Baustelle unbekannt – bitte wählen'}</span>}>
                <span class="az-quelle eigen">eigener Wert</span>
                <Show when={s.land()}>{' '}<button type="button" class="knopf klein" title="Feiertage wieder nach dem Bundesland der Baustelle" onClick={() => setEigenesLand('')}>↺ {landName(s.land()!)} (aus Baustelle)</button></Show>
              </Show>
              <div class="wahl-chips az-laender" role="radiogroup" aria-label="Feiertage"><For each={BUNDESLAENDER}>{(b) =>
                <button type="button" role="radio" aria-checked={wirksam() === b.wert} classList={{ aktiv: wirksam() === b.wert }} disabled={!schreiben()}
                  onClick={() => setEigenesLand(b.wert === s.land() ? '' : b.wert)}>{b.titel}</button>}</For></div>
            </div></div>
          <h3 class="az-titel">Eigene freie Tage</h3>
          <table class="tabelle schmal az-frei">
            <colgroup><col style={{ width: '170px' }} /><col style={{ width: '170px' }} /><col /><col style={{ width: '56px' }} /><col style={{ width: '40px' }} /></colgroup>
            <thead><tr><th>Von</th><th>Bis</th><th>Bezeichnung</th><th title="jedes Jahr wiederholen">jährl.</th><th /></tr></thead>
            <tbody>
              <For each={frei()} fallback={<tr><td colSpan={5} class="still-text">Noch keine – unten „+ freie Tage“ oder eine Vorlage wählen.</td></tr>}>{(f, i) => (
                <tr>
                  <td><FeldEingabe feld={feld('von')} wert={f.von} gesperrt={!schreiben()} onWert={(w) => setze(i(), { von: (w as string) || null })} /></td>
                  <td><FeldEingabe feld={feld('bis')} wert={f.bis} gesperrt={!schreiben()} onWert={(w) => setze(i(), { bis: (w as string) || null })} /></td>
                  <td><input value={f.name} placeholder="z. B. Betriebsferien" disabled={!schreiben()} aria-label="Bezeichnung" onInput={(e) => setze(i(), { name: e.currentTarget.value })} /></td>
                  <td class="mitte"><input type="checkbox" checked={f.jaehrlich} disabled={!schreiben()} aria-label="jedes Jahr" onChange={(e) => setze(i(), { jaehrlich: e.currentTarget.checked })} /></td>
                  <td><Show when={schreiben()}><button type="button" class="knopf klein still" aria-label="Entfernen" onClick={() => setFrei(frei().filter((_, k) => k !== i()))}>✕</button></Show></td>
                </tr>
              )}</For>
            </tbody>
          </table>
          <Show when={schreiben()}>
            <div class="az-knoepfe">
              <button type="button" class="knopf klein" onClick={() => { const t = isoAus(Math.max(tagAus(new Date().toLocaleDateString('sv')), tagAus(anfang()))); setFrei([...frei(), { von: t, bis: t, name: '', jaehrlich: false }]); }}>+ freie Tage</button>
              <button type="button" class="knopf klein" onClick={() => vorlage('weihnachten')}>+ Weihnachtsferien 24.12.–01.01. (jährlich)</button>
              <button type="button" class="knopf klein" onClick={() => vorlage('feiertage')}>+ Heiligabend und Silvester (jährlich)</button>
            </div>
          </Show>
          <h3 class="az-titel">Freie Tage im Projektzeitraum</h3>
          <Show when={vorschau().tage.length} fallback={<p class="still-text">Keine Feiertage oder freien Tage im Projektzeitraum.</p>}>
            <p class="still-text klein-text">{vorschau().tage.length} zusätzliche arbeitsfreie Tage zwischen {tagname(isoAus(vorschau().a))} und {tagname(isoAus(vorschau().z))}:</p>
            <div class="az-tage"><For each={vorschau().tage}>{(d) => <span class="az-tag"><b>{tagname(isoAus(d.t))}</b> {d.name}</span>}</For></div>
          </Show>
        </div>
      </Show>
    </Dialog>
  );
}

/** Projektinformationen wie bisher: Name dieser Version, Projektanfang, Projektende (berechnet), Kalender kurz – mit dem Weg zu
 *  „Arbeitszeit & Feiertage“. */
export function ProjektinfoFenster(p: { onZu: () => void; onArbeitszeit: () => void }): JSX.Element {
  const s = planStand();
  const [name, setName] = createSignal(String(s.version()?.werte.name ?? ''));
  const [anfang, setAnfang] = createSignal<string | null>((s.zp()?.werte.anfang as string) ?? null);
  const feld = (): Feld => modell('zeitplan').felder.find((f) => f.name === 'anfang')!;
  const ende = () => (s.version() ? planDerVersion(s.version()!.id).erg.endeDatum : '');
  const geaendert = () => name() !== String(s.version()?.werte.name ?? '') || anfang() !== ((s.zp()?.werte.anfang as string) ?? null);
  const ok = () => {
    const befehle: Vorlage[] = [];
    if (name().trim() && name().trim() !== String(s.version()!.werte.name ?? '')) befehle.push({ objekt: 'version', art: 'aendern', objektId: s.version()!.id, werte: { name: name().trim() } });
    if (anfang() && anfang() !== s.zp()?.werte.anfang) befehle.push(kalenderBefehl(s, { anfang: anfang() }));
    if (befehle.length) ausfuehrenMehrere(befehle, 'Projektinformationen');
    p.onZu();
  };
  const v = (z: Zeile | undefined) => z?.werte ?? {};
  return (
    <Dialog titel="Projektinformationen" onAbbrechen={p.onZu} geaendert={geaendert}
      knoepfe={<><button class="knopf" onClick={p.onZu}>Abbrechen</button><button class="knopf haupt" disabled={!s.version() || !darf('zeitplan', 'schreiben')} onClick={ok}>OK</button></>}>
      <Show when={s.version()} fallback={<p class="still-text">Noch kein Bauzeitenplan in diesem Projekt.</p>}>
        <div class="formular az-info">
          <div class="feld"><label>Projekt</label><span>{String(sicht.projekt?.[s.projekt()]?.werte.name ?? '')}</span></div>
          <div class="feld"><label for="pi-name">Name dieser Version</label><input id="pi-name" value={name()} autocomplete="off" disabled={!darf('version', 'schreiben')} onInput={(e) => setName(e.currentTarget.value)} /></div>
          <FeldEingabe feld={feld()} wert={anfang()} gesperrt={!darf('zeitplan', 'schreiben')} onWert={(w) => setAnfang((w as string) || null)} />
          <div class="feld"><label>Projektende</label><span>{ende() ? `${tagname(ende())} (berechnet)` : '–'}</span></div>
          <div class="feld"><label>Kalender</label>
            <span>{WOCHEN.find((w) => w.wert === String(v(s.zp()).arbeitswoche ?? '5'))?.titel} · {landName(String(v(s.zp()).bundesland || s.land() || 'DE'))} · {s.freie().length} eigene freie Zeiträume{' '}
              <button type="button" class="knopf klein" onClick={() => { p.onZu(); p.onArbeitszeit(); }}>Arbeitszeit & Feiertage …</button></span></div>
        </div>
      </Show>
    </Dialog>
  );
}
