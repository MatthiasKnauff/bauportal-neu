// LV aus einer Datei (wie im bisherigen Bauportal): PDF, Scan, Foto oder Word. Der Dateidienst liest die Wörter mit ihrer Stelle,
// module/ava/lvlesen macht daraus einen Vorschlag. Links der Vorschlag zum Anhaken und Ändern, rechts das Dokument – eine Zeile
// anklicken übernimmt sie als Position unter der markierten (mit Umschalt: an deren Langtext). Findet die Erkennung zu wenig, liest
// auf Wunsch eine KI (über den KI-Ausgang: anonymisiert, protokolliert, mit Kostendeckel). Übernommen wird über denselben Weg wie
// beim Excel-Einlesen (Vorschau, doppelte OZ, ein Rückgängig); auf Wunsch liegt die Datei danach beim LV.
import { For, Show, createSignal, type JSX } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { alsTabelle, type Vorschlag } from '../module/ava/lvlesen';
import { DOKUMENTE, vorschlagAus, type DateiZeile, type Gelesen } from './dateilesen';
import { dateiWaehlen } from './baukasten/dateiwahl';
import { Dialog } from './baukasten/dialog';
import { kiAnbindungen } from './baukasten/ki';
import { dokumenteAblegen } from './dokumentablage';
import { lvTabelleEinlesen } from './lvexcel';
import { darf, ruf } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';

const [offen, setOffen] = createSignal<{ lv: Zeile; datei: File; g: Gelesen } | null>(null);
/** „Import ▸ PDF, Scan, Foto oder Word …“ im LV. */
export function lvAusDatei(lv: Zeile): void {
  dateiWaehlen(DOKUMENTE, async (datei) => { const g = await vorschlagAus(datei); if (g) setOffen({ lv, datei, g }); });
}

export function LvAusDateiFenster(): JSX.Element {
  return <Show when={offen()} keyed>{(o) => <Fenster lv={o.lv} datei={o.datei} g={o.g} onZu={() => setOffen(null)} />}</Show>;
}

function Fenster(p: { lv: Zeile; datei: File; g: Gelesen; onZu: () => void }): JSX.Element {
  type Eintrag = Vorschlag & { an: boolean };
  const [liste, setListe] = createSignal<Eintrag[]>(p.g.vorschlag.map((v) => ({ ...v, an: true })));
  const [markiert, setMarkiert] = createSignal<number | null>(null);
  const [mengen, setMengen] = createSignal(true), [preise, setPreise] = createSignal(p.g.vorschlag.some((v) => v.ep !== null));
  const [ablegen, setAblegen] = createSignal(darf('dokument', 'schreiben'));
  const [ki, setKi] = createSignal<'bereit' | 'laeuft'>('bereit');
  const aendern = (i: number, w: Partial<Eintrag>) => setListe((l) => l.map((x, k) => (k === i ? { ...x, ...w } : x)));
  const gewaehlt = () => liste().filter((x) => x.an);
  const positionen = () => gewaehlt().filter((x) => x.art === 'normal').length;
  // Zeile im Dokument anklicken: als Position unter der markierten – mit Umschalt an deren Langtext (wie bisher)
  const zeileNehmen = (z: DateiZeile, e: MouseEvent) => {
    const m = markiert();
    if (e.shiftKey && m !== null) { const x = liste()[m]!; aendern(m, { langtext: [x.langtext, z.text].filter(Boolean).join('\n') }); return; }
    const neu: Eintrag = { art: 'normal', oz: '', kurztext: z.text.slice(0, 250), langtext: '', menge: null, einheit: '', ep: null, gp: null, zeilen: [p.g.zeilen.indexOf(z)], an: true };
    const bei = m === null ? liste().length : m + 1;
    setListe((l) => [...l.slice(0, bei), neu, ...l.slice(bei)]); setMarkiert(bei);
  };
  const gezeigt = () => new Set(markiert() === null ? [] : liste()[markiert()!]?.zeilen ?? []);
  const genommen = () => new Set(gewaehlt().flatMap((x) => x.zeilen));
  // KI: der Text des Dokuments geht über den KI-Ausgang (anonymisiert); der Vorschlag ersetzt die Liste – übernommen wird erst unten
  const mitKi = async () => {
    const anb = kiAnbindungen()[0]; if (!anb) return;
    setKi('laeuft');
    try {
      const text = p.g.zeilen.map((z) => z.text).join('\n').slice(0, 20000);
      const r = await ruf<{ vorschlag: string }>('/api/ki/text', { anbindung: anb.id, aufgabe: 'lv_lesen', text });
      const j = JSON.parse(r.vorschlag.replace(/^```(json)?|```$/g, '')) as { items?: { typ?: string; oz?: string; kurz?: string; lang?: string; menge?: number | null; einheit?: string; ep?: number | null }[] };
      const v = (j.items ?? []).filter((x) => String(x.kurz ?? '').trim()).map((x): Eintrag => ({ art: x.typ === 'titel' ? 'titel' : 'normal', oz: String(x.oz ?? '').replace(/\.$/, ''), kurztext: String(x.kurz).trim().slice(0, 250),
        langtext: String(x.lang ?? ''), menge: typeof x.menge === 'number' ? x.menge : null, einheit: String(x.einheit ?? ''), ep: typeof x.ep === 'number' ? x.ep : null, gp: null, zeilen: [], an: true }));
      if (!v.length) { hinweis('Die KI hat keine Positionen gefunden – Zeilen rechts anklicken übernimmt sie einzeln.', { art: 'fehler' }); return; }
      setListe(v); setMarkiert(null); setPreise(v.some((x) => x.ep !== null));
      hinweis(`Die KI hat ${v.filter((x) => x.art === 'normal').length} Positionen und ${v.filter((x) => x.art === 'titel').length} Titel erkannt – bitte prüfen.`);
    } catch (e) { hinweis(e instanceof SyntaxError ? 'Die Antwort der KI ließ sich nicht lesen.' : (e as Error).message, { art: 'fehler' }); }
    finally { setKi('bereit'); }
  };
  const weiter = () => {
    const datei = p.datei, lv = p.lv;
    const mitAblegen = ablegen();
    lvTabelleEinlesen(lv, datei.name, alsTabelle(gewaehlt(), { mengen: mengen(), preise: preise() }),
      () => { if (mitAblegen) dokumenteAblegen([datei], { zu: { objekt: 'lv', id: lv.id, titel: `LV ${[lv.werte.nummer, lv.werte.name].filter(Boolean).join(' ')}`, art: 'lv' } }); });
    p.onZu();
  };
  return (
    <Dialog titel={`LV aus dem Dokument – ${p.datei.name}`} gross onAbbrechen={p.onZu} geaendert={() => true}
      knoepfe={<>
        <button type="button" class="knopf" onClick={p.onZu}>Abbrechen</button>
        <Show when={kiAnbindungen().length}><button type="button" class="knopf" disabled={ki() === 'laeuft'} title="Die KI liest das Dokument und schlägt Titel und Positionen vor – auch bei Angeboten, Listen oder Fotos ohne festes LV-Schema" onClick={() => void mitKi()}>{ki() === 'laeuft' ? 'Die KI liest …' : 'Mit KI lesen …'}</button></Show>
        <button type="button" class="knopf haupt" disabled={!gewaehlt().length} onClick={weiter}>Weiter ({positionen()} Positionen)</button></>}>
      <div class="lvd">
        <div class="lvd-liste">
          <p class="still-text klein-text">{p.g.vorschlag.length ? `Erkannt: ${p.g.vorschlag.filter((x) => x.art === 'normal').length} Positionen, ${p.g.vorschlag.filter((x) => x.art === 'titel').length} Titel${p.g.ocr ? ' (Texterkennung)' : ''}.` : 'Ohne KI wurden keine Positionen sicher erkannt.'}
            {' '}Rechts eine Zeile anklicken übernimmt sie als Position unter der markierten, mit Umschalt an deren Langtext.</p>
          <div class="reihe lvd-optionen">
            <label><input type="checkbox" checked={mengen()} onChange={(e) => setMengen(e.currentTarget.checked)} /> Mengen übernehmen</label>
            <label><input type="checkbox" checked={preise()} onChange={(e) => setPreise(e.currentTarget.checked)} /> Preise als Schätzpreis</label>
            <Show when={darf('dokument', 'schreiben')}><label><input type="checkbox" checked={ablegen()} onChange={(e) => setAblegen(e.currentTarget.checked)} /> Datei beim LV ablegen</label></Show>
          </div>
          <ul class="lvd-vorschlag" role="list">
            <For each={liste()}>{(x, i) => (
              <li classList={{ titel: x.art === 'titel', aus: !x.an, markiert: markiert() === i() }} onClick={() => setMarkiert(i())}>
                <input type="checkbox" checked={x.an} aria-label={`${x.oz} ${x.kurztext} übernehmen`} onClick={(e) => e.stopPropagation()} onChange={(e) => aendern(i(), { an: e.currentTarget.checked })} />
                <input class="lvd-oz" value={x.oz} aria-label="OZ" onChange={(e) => aendern(i(), { oz: e.currentTarget.value.trim() })} />
                <input class="lvd-kurz" value={x.kurztext} aria-label="Kurztext" onChange={(e) => aendern(i(), { kurztext: e.currentTarget.value })} />
                <span class="lvd-menge">{x.art === 'titel' ? 'Titel' : [x.menge !== null ? x.menge.toLocaleString('de-DE') : '', x.einheit, x.ep !== null ? `· ${x.ep.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €` : ''].filter(Boolean).join(' ')}</span>
                <button type="button" class="knopf klein still" title={x.art === 'titel' ? 'als Position' : 'als Titel'} onClick={(e) => { e.stopPropagation(); aendern(i(), { art: x.art === 'titel' ? 'normal' : 'titel' }); }}>{x.art === 'titel' ? 'T' : 'P'}</button>
              </li>)}</For>
          </ul>
        </div>
        <div class="lvd-dokument" aria-label="Dokument">
          <For each={p.g.seiten}>{(s, n) => (
            <div class="lvd-seite" classList={{ ohnebild: !s.bild }}>
              <Show when={s.bild}><img src={`data:image/jpeg;base64,${s.bild}`} alt={`Seite ${n() + 1}`} /></Show>
              <For each={p.g.zeilen.filter((z) => z.seite === n())}>{(z) => { const k = p.g.zeilen.indexOf(z); return (
                <button type="button" class="lvd-zeile" classList={{ gezeigt: gezeigt().has(k), genommen: genommen().has(k) }} title={z.text}
                  style={{ left: `${z.x0 * 100}%`, top: `${z.y0 * 100}%`, width: `${(z.x1 - z.x0) * 100}%`, height: `${Math.max(1.2, (z.y1 - z.y0) * 100)}%` }}
                  onClick={(e) => zeileNehmen(z, e)}>{s.bild ? '' : z.text}</button>); }}</For>
            </div>)}</For>
        </div>
      </div>
    </Dialog>
  );
}
