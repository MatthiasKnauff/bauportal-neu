// Rechnung einlesen (E-Rechnung: XRechnung oder ZUGFeRD-PDF): Nummer, Datum, Firma und Leistungsstand aus den Daten der Firma,
// Auftrag (LV) nach der Firma vorgeschlagen; die Mengen je OZ können gleich ins Aufmaß („Menge laut Firma“). Ein Rückgängig für alles.
// Gelesen wird im Gerät – die Datei geht nirgends hin. PDFs ohne E-Rechnung (Texterkennung) kommen als eigener Block.
import { Show, createMemo, createSignal } from 'solid-js';
import type { Vorlage, Zeile } from '../kern/befehl';
import { firmenSchluessel } from '../kern/dokumenterkennung';
import { mengenZuordnen } from '../module/ava/aufmasslesen';
import { RECHNUNGSARTEN } from '../module/ava/beipackzettel';
import { eRechnungLesen, eRechnungXml, type ERechnung } from '../module/ava/erechnung';
import { nachOz } from '../module/ava/rechnung';
import { MengenTabelle, mengenBefehle } from './aufmasseinlesen';
import { Auswahlliste } from './baukasten/auswahlliste';
import { Dialog } from './baukasten/dialog';
import { ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { neueKennung } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';

const [offen, setOffen] = createSignal<{ name: string; projekt: string; r: ERechnung } | null>(null);

export function rechnungEinlesen(projekt: string): void {
  const wahl = document.createElement('input');
  wahl.type = 'file'; wahl.accept = '.pdf,.xml';
  wahl.onchange = async () => {
    const d = wahl.files?.[0]; if (!d) return;
    try {
      const xml = await eRechnungXml(new Uint8Array(await d.arrayBuffer()));
      const r = xml ? eRechnungLesen(xml) : null;
      if (!r) { hinweis(`In „${d.name}“ steckt keine E-Rechnung (XRechnung oder ZUGFeRD). Rechnungen ohne E-Rechnung bitte von Hand anlegen.`, { art: 'fehler' }); return; }
      setOffen({ name: d.name, projekt, r });
    } catch (e) { hinweis((e as Error).message, { art: 'fehler' }); }
  };
  wahl.click();
}


function Fenster(p: { name: string; projekt: string; r: ERechnung }) {
  const r = p.r;
  const kontakte = createMemo(() => lebende('kontakt').sort((a, b) => String(a.werte.name ?? '').localeCompare(String(b.werte.name ?? ''), 'de')));
  const vorschlagFirma = () => {
    const s = firmenSchluessel(r.firma); if (!s) return '';
    return (kontakte().find((k) => firmenSchluessel(k.werte.name) === s) ?? kontakte().find((k) => { const t = firmenSchluessel(k.werte.name); return t.length > 2 && (t.includes(s) || s.includes(t)); }))?.id ?? '';
  };
  const lvs = createMemo(() => lebende('lv').filter((l) => l.werte.projekt === p.projekt));
  const auftragVon = (lv: string) => lebende('angebot').find((a) => a.werte.lv === lv && a.werte.beauftragt === true);
  const [firma, setFirma] = createSignal(vorschlagFirma());
  const vorschlagLv = (f: string) => { const l = lvs().filter((x) => f && auftragVon(x.id)?.werte.bieter === f); return l.length === 1 ? l[0]!.id : ''; };
  const [lv, setLv] = createSignal(vorschlagLv(firma()));
  const [art, setArt] = createSignal('abschlag');
  const [aus, setAus] = createSignal<Set<string>>(new Set());
  const lvZeile = () => sicht.lv?.[lv()];
  const positionen = createMemo(() => (lv() ? nachOz(lebende('lv_position').filter((q) => q.werte.lv === lv())) : []));
  const aufmasse = createMemo(() => new Map(lebende('aufmass').filter((a) => a.werte.lv === lv()).map((a) => [String(a.werte.position), a] as [string, Zeile])));
  const mengen = createMemo(() => mengenZuordnen(r.zeilen.filter((z) => z.oz).map((z) => ({ oz: z.oz, menge: z.menge })), positionen()));
  const doppelt = createMemo(() => lebende('rechnung').some((x) => x.werte.projekt === p.projekt && String(x.werte.nummer ?? '') === r.nummer && (!firma() || x.werte.firma === firma())));
  const eur = (n: number | null) => (n == null ? '–' : `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
  const einlesen = () => {
    const befehle: Vorlage[] = [{ objekt: 'rechnung', art: 'anlegen', objektId: neueKennung(), werte: {
      projekt: p.projekt, lv: lv() || null, firma: firma() || null, art: art(), nummer: r.nummer || null, datum: r.datum || null,
      eingang: new Date().toISOString().slice(0, 10), betrag: r.netto, status: 'offen' } }];
    const m = lvZeile() ? mengenBefehle(mengen().treffer.filter((t) => !aus().has(t.position)), lvZeile()!, aufmasse()) : [];
    ausfuehrenMehrere([...befehle, ...m], `Rechnung ${r.nummer} eingelesen`);
    hinweis(`Rechnung ${r.nummer} angelegt${m.length ? `, ${m.length} ${m.length === 1 ? 'Menge' : 'Mengen'} ins Aufmaß` : ''} – ein Rückgängig nimmt alles zurück.`);
    setOffen(null);
  };
  return (
    <Dialog titel={`Rechnung einlesen – ${p.name}`} gross onAbbrechen={() => setOffen(null)} geaendert={() => true}
      knoepfe={<><button class="knopf" onClick={() => setOffen(null)}>Abbrechen</button>
        <button class="knopf haupt" disabled={doppelt()} onClick={einlesen}>Einlesen</button></>}>
      <div class="einlesen">
        <p class="still-text">E-Rechnung {r.nummer} vom {r.datum ? r.datum.split('-').reverse().join('.') : '–'} · {r.firma || 'Firma nicht angegeben'}</p>
        <div class="re-kopf">
          <label>Firma<Auswahlliste titel="Firma" wert={firma()} optionen={[{ wert: '', titel: '– keine –' }, ...kontakte().map((k) => ({ wert: k.id, titel: String(k.werte.name ?? '') }))]}
            onWert={(w) => { setFirma(w); if (!lv()) setLv(vorschlagLv(w)); }} /></label>
          <label>Auftrag (LV)<Auswahlliste titel="Auftrag (LV)" wert={lv()} optionen={[{ wert: '', titel: '– keiner –' }, ...lvs().map((l) => ({ wert: l.id, titel: [l.werte.nummer, l.werte.name].filter(Boolean).join(' · ') }))]}
            onWert={(w) => { setLv(w); setAus(new Set<string>()); }} /></label>
          <label>Art<Auswahlliste titel="Art" wert={art()} optionen={RECHNUNGSARTEN} onWert={setArt} /></label>
        </div>
        <table class="einlesen-tabelle re-summen">
          <tbody>
            <tr><td>Leistungsstand netto (Summe der Positionen)</td><td class="zahl">{eur(r.netto)}</td></tr>
            {r.abzuege.map((x) => <tr><td>{x.text}</td><td class="zahl">{eur(x.betrag)}</td></tr>)}
            <tr><td>Umsatzsteuer · brutto</td><td class="zahl">{eur(r.ust)} · {eur(r.brutto)}</td></tr>
            <tr><td>Zahlbetrag laut Firma</td><td class="zahl">{eur(r.zahlbetrag)}</td></tr>
          </tbody>
        </table>
        <Show when={doppelt()}><p class="feld-fehler">Die Rechnung {r.nummer} ist schon eingelesen.</p></Show>
        <Show when={lv() && r.zeilen.some((z) => z.oz)}>
          <h3>Mengen ins Aufmaß („Menge laut Firma“)</h3>
          <MengenTabelle treffer={mengen().treffer} fremd={mengen().fremd} positionen={positionen()} aufmasse={aufmasse()} aus={aus()} setAus={setAus} />
        </Show>
      </div>
    </Dialog>
  );
}

export function RechnungEinlesen() {
  return <Show when={offen()}>{(o) => <Fenster name={o().name} projekt={o().projekt} r={o().r} />}</Show>;
}
