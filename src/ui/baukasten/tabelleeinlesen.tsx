// Baustein „Tabelle einlesen“: eine Excel- oder CSV-Datei als Einträge eines Objekts einlesen – Datei wählen → je Spalte das Feld
// zuordnen (Vorschlag aus Titel und Kurztitel der Felder, mit Beispielwert) → Vorschau → „Einlesen“ legt alles mit einem
// Rückgängig an. Werte wie getippt: Auswahl nach Titel, Ja/Nein aus „x“, Mehrfach aus Stichwörtern, Zahlen mit Komma (kern/werttext).
// Gelesen wird im Gerät – die Datei geht nirgends hin. Dieselbe Einlesung für jede Liste (zuerst die Fenster- & Türliste).
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { Vorlage } from '../../kern/befehl';
import type { Feld, ObjektModell, Werte } from '../../kern/modell';
import { tabelleLesen, type Tabelle } from '../../kern/tabellendatei';
import { wertAusText } from '../../kern/werttext';
import { ausfuehrenMehrere } from '../unterbau/abgleich';
import { neueKennung } from '../unterbau/api';
import { hinweis } from '../unterbau/meldungen';
import { Auswahlliste } from './auswahlliste';
import { Dialog } from './dialog';
import { TABELLEN, dateiWaehlen } from './dateiwahl';
import { anzeige } from './feld';

/** Was eingelesen wird: in welches Objekt, welche Felder zur Wahl stehen, was jeder neue Eintrag bekommt (Zusammenhang), welche
 *  Felder die Vorschau zeigt. */
export interface Einlesung { modell: ObjektModell; felder: Feld[]; fest: Werte; vorschau: string[] }
const [offen, setOffen] = createSignal<{ name: string; t: Tabelle; e: Einlesung } | null>(null);

export function tabelleEinlesen(e: Einlesung): void {
  dateiWaehlen(TABELLEN, async (d) => {
    try { setOffen({ name: d.name, t: await tabelleLesen(d.name, new Uint8Array(await d.arrayBuffer())), e }); }
    catch (err) { hinweis((err as Error).message, { art: 'fehler' }); }
  });
}

const einfach = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
/** Feld je Spalte vorschlagen: Spaltenkopf gleich Titel, Kurztitel oder Name – sonst der Anfang des Titels. */
export function zuordnungVorschlagen(kopf: string[], felder: Feld[]): string[] {
  const genommen = new Set<string>();
  return kopf.map((k) => {
    const x = einfach(k); if (!x) return '';
    const f = felder.find((f) => !genommen.has(f.name) && [f.titel, f.kurz ?? '', f.name].some((t) => einfach(t) === x))
      ?? felder.find((f) => !genommen.has(f.name) && x.length >= 3 && (einfach(f.titel).startsWith(x) || x.startsWith(einfach(f.kurz ?? f.titel))));
    if (f) genommen.add(f.name);
    return f?.name ?? '';
  });
}

function EinlesenFenster(p: { name: string; t: Tabelle; e: Einlesung }) {
  const [zuordnung, setZuordnung] = createSignal(zuordnungVorschlagen(p.t.kopf, p.e.felder));
  const [aus, setAus] = createSignal<Set<number>>(new Set());   // abgewählte Zeilen
  const feld = (n: string) => p.e.felder.find((f) => f.name === n);
  const zeilen = createMemo(() => p.t.zeilen.map((z) => {
    const werte: Werte = {}, falsch: string[] = [];
    zuordnung().forEach((n, i) => { const f = feld(n); if (!f || !z[i]) return; const w = wertAusText(f, z[i]!); if (w === undefined) falsch.push(`${f.titel}: „${z[i]}“`); else werte[n] = w; });
    return { werte, falsch };
  }));
  const anzahl = () => zeilen().filter((_, i) => !aus().has(i)).length;
  const beispiel = (i: number) => p.t.zeilen.find((z) => z[i])?.[i] ?? '';
  const einlesen = () => {
    const befehle: Vorlage[] = zeilen().flatMap((z, i) => (aus().has(i) ? [] : [{ objekt: p.e.modell.name, art: 'anlegen' as const, objektId: neueKennung(), werte: { ...z.werte, ...p.e.fest } }]));
    if (befehle.length) ausfuehrenMehrere(befehle, `${p.name} eingelesen`);
    hinweis(`${befehle.length} ${befehle.length === 1 ? 'Zeile' : 'Zeilen'} eingelesen – ein Rückgängig nimmt alles zurück.`);
    setOffen(null);
  };
  const optionen = [{ wert: '', titel: '– nicht einlesen –' }, ...p.e.felder.map((f) => ({ wert: f.name, titel: f.gruppe ? `${f.gruppe}: ${f.titel}` : f.titel }))];
  return (
    <Dialog titel={`${p.e.modell.titelMehrzahl} einlesen – ${p.name}`} gross onAbbrechen={() => setOffen(null)} geaendert={() => true}
      knoepfe={<><button class="knopf" onClick={() => setOffen(null)}>Abbrechen</button><button class="knopf haupt" disabled={!anzahl()} onClick={einlesen}>Einlesen ({anzahl()})</button></>}>
      <div class="einlesen">
        <h3>Spalten zuordnen</h3>
        <div class="einlesen-spalten">
          <For each={p.t.kopf}>{(k, i) => (
            <div class="einlesen-spalte" classList={{ leer: !zuordnung()[i()] }}>
              <b>{k || `Spalte ${i() + 1}`}</b><small>{beispiel(i())}</small>
              <Auswahlliste titel={`Spalte ${k || i() + 1}`} wert={zuordnung()[i()] ?? ''} optionen={optionen}
                onWert={(w) => setZuordnung(zuordnung().map((x, j) => (j === i() ? w : x === w && w ? '' : x)))} />
            </div>
          )}</For>
        </div>
        <h3>Vorschau – {zeilen().length} Zeilen</h3>
        <div class="einlesen-liste">
          <table class="einlesen-tabelle">
            <thead><tr><th /><For each={p.e.vorschau.map(feld).filter((f): f is Feld => !!f)}>{(f) => <th>{f.kurz ?? f.titel}</th>}</For><th /></tr></thead>
            <tbody>
              <For each={zeilen()}>{(z, i) => (
                <tr classList={{ aus: aus().has(i()) }}>
                  <td><input type="checkbox" checked={!aus().has(i())} aria-label={`Zeile ${i() + 1} einlesen`} onChange={(e) => { const s = new Set(aus()); if (e.currentTarget.checked) s.delete(i()); else s.add(i()); setAus(s); }} /></td>
                  <For each={p.e.vorschau.map(feld).filter((f): f is Feld => !!f)}>{(f) => <td>{anzeige(f, z.werte[f.name])}</td>}</For>
                  <td><Show when={z.falsch.length}><span class="feld-fehler klein-text" title={z.falsch.join(' · ')}>{z.falsch.length} Wert{z.falsch.length === 1 ? '' : 'e'} passt nicht</span></Show></td>
                </tr>
              )}</For>
            </tbody>
          </table>
        </div>
        <p class="still-text klein-text">Werte wie getippt: Auswahl nach ihrem Titel, Ja/Nein aus „x“ oder „ja“, mehrere Angaben mit Komma getrennt. Was nicht passt, bleibt leer.</p>
      </div>
    </Dialog>
  );
}

export function TabelleEinlesen() {
  return <Show when={offen()}>{(o) => <EinlesenFenster name={o().name} t={o().t} e={o().e} />}</Show>;
}
