// Angebotsbesprechung in der Oberfläche: anlegen bzw. öffnen an der Karte des Angebots; an der Karte des Protokolls der
// Abgleich mit den Daten (solange Entwurf) und Abschließen. Die Rechnung „Protokoll aus den Daten“ steht in
// module/ava/besprechung.ts; hier werden nur die Quellen zusammengesucht und die Befehle geschickt.
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { Vorlage, Zeile } from '../kern/befehl';
import type { Werte } from '../kern/modell';
import { GRUNDLAGEN, abgleich, ausDenDaten, klaerungspunkte, rueckweg, type Quellen } from '../module/ava/besprechung';
import { Dialog } from './baukasten/dialog';
import { nachOz, zahl } from '../module/ava/rechnung';
import { angeboteVon, preiseVon } from './avadaten';
import { vertragAusDaten } from '../module/ava/vertrag';
import { lvZahlen } from './avadaten';
import { einsatzAus } from '../module/bauzeitenplan/gewerke';
import { isoAus } from '../module/bauzeitenplan/kalender';
import { BUERO_ID } from '../module/verwaltung/beipackzettel';
import { ausfuehren, ausfuehrenMehrere, lebende, sicht, wirksameWerte } from './unterbau/abgleich';
import { darf, ich, modell, neueKennung } from './unterbau/api';
import { aktuelleVersion, planDerVersion } from './plandaten';
import { springeZu } from './sprung';
import { hinweis } from './unterbau/meldungen';

const kurz = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

/** Die Quellen eines Angebots: Projekt, Büro, Bieter:in, Angebot, LV und die Termine des Gewerks im Bauzeitenplan. */
function quellen(angebot: Werte): Quellen {
  const lv = sicht.lv?.[String(angebot.lv)] && wirksameWerte(modell('lv'), sicht.lv[String(angebot.lv)]!.werte), projekt = String(angebot.projekt ?? '');
  const kg = lv?.kostengruppe ? sicht.kostengruppe?.[String(lv.kostengruppe)]?.werte : undefined;
  const q: Quellen = {
    projekt: sicht.projekt?.[projekt]?.werte, bauherr: sicht.kontakt?.[String(sicht.projekt?.[projekt]?.werte.bauherrschaft ?? '')]?.werte, buero: sicht.buero?.[BUERO_ID]?.werte, bieter: sicht.kontakt?.[String(angebot.bieter)]?.werte, angebot, lv,
    gewerkName: lv?.gewerk ? String(sicht.gewerk?.[String(lv.gewerk)]?.werte.name ?? '') : '', kostengruppe: kg ? String(kg.nummer ?? '') : '',
  };
  // Klärungspunkte aus dem Preisspiegel: Abweichung vom Mittel, Bedarfs-/Wahlpositionen, fehlende Preise
  const lvId = String(angebot.lv ?? ''), eigenes = angeboteVon(lvId).find((x) => x.werte.bieter === angebot.bieter && x.werte.lv === angebot.lv);
  if (eigenes) {
    const ang = angeboteVon(lvId), pr = preiseVon(ang);
    q.klaerung = klaerungspunkte(nachOz(lebende('lv_position').filter((x) => x.werte.lv === lvId && !x.werte.nachtrag)), ang, eigenes.id,
      (a, p) => { const x = pr.get(`${a}:${p}`)?.werte.ep; return x == null || x === '' ? null : zahl(x); });
  }
  // Termine: die Leistungen des Plans mit diesem Gewerk nach VOB/C oder dieser Firma
  const v = projekt ? aktuelleVersion(projekt) : undefined;
  if (v) {
    const ids = new Set(lebende('vorgang').filter((x) => x.werte.version === v.id && ((lv?.gewerk && x.werte.vob === lv.gewerk) || (angebot.bieter && x.werte.firma === angebot.bieter))).map((x) => x.id));
    if (ids.size) {
      const e = einsatzAus(planDerVersion(v.id), ids);
      if (e.length) q.termine = {
        beginn: isoAus(e[0]![0]), fertig: isoAus(e.at(-1)![1]),
        unterbrechung: e.length > 1 ? e.map(([a, b]) => `${kurz(isoAus(a))}–${kurz(isoAus(b))}`).join(', ') : '',
        plan: `Version „${String(v.werte.name ?? '')}“`,
      };
    }
  }
  return q;
}

/** Angebotsbesprechung zu einem Angebot öffnen – fehlt sie, aus den Daten anlegen (Karte des Angebots, Preisspiegel). */
export function besprechungOeffnen(angebot: Zeile): void {
  const da = lebende('besprechung').find((b) => b.werte.angebot === angebot.id);
  const oeffnen = (id: string) => springeZu('besprechung', id, { projekt: String(angebot.werte.projekt), modul: 'ava', ansicht: 'besprechungen' });
  if (da) { oeffnen(da.id); return; }
  if (!darf('besprechung', 'schreiben')) return;
  const id = neueKennung(), a = angebot.werte, daten = ausDenDaten(quellen(a));
  ausfuehrenMehrere([
    { objekt: 'besprechung', art: 'anlegen', objektId: id, werte: { projekt: a.projekt ?? null, lv: a.lv ?? null, angebot: angebot.id, stand: 'entwurf', datum: new Date().toLocaleDateString('sv'), teilnehmer: ich().name ?? '' } },
    { objekt: 'besprechung', art: 'aendern', objektId: id, werte: { ...daten, quellen: JSON.stringify(daten) }, herkunft: 'daten' },
  ], 'Angebotsbesprechung anlegen');
  oeffnen(id);
}
/** Bauvertrag zum beauftragten Angebot öffnen – fehlt er, einmal aus Auftrag und Protokoll anlegen (danach ein eigenes Schriftstück). */
export function bauvertragOeffnen(angebot: Zeile): void {
  const da = lebende('bauvertrag').find((b) => b.werte.angebot === angebot.id);
  const oeffnen = (id: string) => springeZu('bauvertrag', id, { projekt: String(angebot.werte.projekt), modul: 'ava', ansicht: 'bauvertraege' });
  if (da) { oeffnen(da.id); return; }
  if (!darf('bauvertrag', 'schreiben')) return;
  const id = neueKennung(), a = angebot.werte, q = quellen(a), protokoll = lebende('besprechung').find((b) => b.werte.angebot === angebot.id);
  const werte = vertragAusDaten({ agArt: 'unternehmen', projekt: q.projekt, bauherr: q.bauherr, bieter: q.bieter, lv: q.lv, angebot: a, gewerkName: q.gewerkName, summe: lvZahlen(String(a.lv)).haupt, protokoll: protokoll?.werte });
  ausfuehrenMehrere([
    { objekt: 'bauvertrag', art: 'anlegen', objektId: id, werte: { projekt: a.projekt ?? null, lv: a.lv ?? null, angebot: angebot.id, datum: new Date().toLocaleDateString('sv') } },
    { objekt: 'bauvertrag', art: 'aendern', objektId: id, werte, herkunft: 'daten' },
  ], 'Bauvertrag anlegen');
  oeffnen(id);
}

/** An der Karte des Angebots: Angebotsbesprechung und (nach der Vergabe) Bauvertrag – anlegen oder öffnen. */
export function BesprechungKnopf(p: { angebot: Zeile }) {
  const da = createMemo(() => lebende('besprechung').find((b) => b.werte.angebot === p.angebot.id));
  const vertrag = createMemo(() => lebende('bauvertrag').find((b) => b.werte.angebot === p.angebot.id));
  return (
    <div class="karte-fuss">
      <Show when={da() || darf('besprechung', 'schreiben')}><button type="button" class="knopf" onClick={() => besprechungOeffnen(p.angebot)}>{da() ? 'Angebotsbesprechung öffnen' : 'Angebotsbesprechung anlegen'}</button></Show>
      <Show when={p.angebot.werte.beauftragt === true && (vertrag() || darf('bauvertrag', 'schreiben'))}>
        <button type="button" class="knopf" onClick={() => bauvertragOeffnen(p.angebot)}>{vertrag() ? 'Bauvertrag öffnen' : 'Bauvertrag anlegen'}</button>
      </Show>
    </div>
  );
}

/** An der Karte des Protokolls: solange Entwurf, folgt es den Daten (auf Knopfdruck); Hinweise bei von Hand Geändertem. */
export function BesprechungAbgleich(p: { z: Zeile }) {
  const m = modell('besprechung');
  const titel = (f: string) => m.felder.find((x) => x.name === f)?.titel ?? f;
  const schreiben = () => darf('besprechung', 'schreiben');
  const entwurf = () => p.z.werte.stand !== 'abgeschlossen';
  const stand = (): Werte => { try { return JSON.parse(String(p.z.werte.quellen || '{}')) as Werte; } catch { return {}; } };
  const daten = createMemo(() => { const a = sicht.angebot?.[String(p.z.werte.angebot)]; return a ? ausDenDaten(quellen(a.werte)) : null; });
  const vergleich = createMemo(() => (daten() ? abgleich(p.z.werte, p.z.herkunft, daten()!, stand()) : { folgen: {}, hinweise: [] }));
  const n = () => Object.keys(vergleich().folgen).length;
  const aendern = (werte: Werte, titelText: string, herkunft?: string) =>
    ausfuehren({ objekt: 'besprechung', art: 'aendern', objektId: p.z.id, werte, ...(herkunft ? { herkunft } : {}) } as Vorlage, titelText);
  const neuerStand = (mehr: Werte) => JSON.stringify({ ...stand(), ...mehr });
  const [abschluss, setAbschluss] = createSignal(false);
  return (
    <Show when={schreiben()}>
      <div class="bsp-abgleich">
        <Show when={entwurf()} fallback={<p class="still-text klein-text">Abgeschlossen – das Protokoll folgt den Daten nicht mehr. <button type="button" class="knopf klein" onClick={() => aendern({ stand: 'entwurf' }, 'Angebotsbesprechung wieder öffnen')}>Wieder öffnen</button></p>}>
          <Show when={n()}>
            <div class="bsp-zeile"><span>{n()} {n() === 1 ? 'Feld folgt' : 'Felder folgen'} den Daten ({Object.keys(vergleich().folgen).map(titel).join(', ')})</span>
              <button type="button" class="knopf klein haupt" onClick={() => aendern({ ...vergleich().folgen, quellen: neuerStand(vergleich().folgen) }, 'Angebotsbesprechung aus den Daten', 'daten')}>Aktualisieren</button></div>
          </Show>
          <For each={vergleich().hinweise}>{(h) => (
            <div class="bsp-zeile bsp-hinweis"><span><b>{titel(h.feld)}</b> wurde von Hand geändert – in den Daten steht jetzt „{h.neu}“.</span>
              <span class="reihe">
                <button type="button" class="knopf klein" onClick={() => aendern({ quellen: neuerStand({ [h.feld]: h.neu }) }, `${titel(h.feld)}: eigene Angabe behalten`)}>Behalten</button>
                <button type="button" class="knopf klein" onClick={() => aendern({ [h.feld]: h.neu, quellen: neuerStand({ [h.feld]: h.neu }) }, `${titel(h.feld)} aus den Daten`, 'daten')}>Übernehmen</button>
              </span></div>
          )}</For>
          <div class="bsp-zeile"><span class="still-text klein-text">Felder mit „aus den Daten“ folgen ihrer Quelle, solange das Protokoll ein Entwurf ist.</span>
            <button type="button" class="knopf klein" onClick={() => setAbschluss(true)}>Abschließen …</button></div>
        </Show>
        <Show when={abschluss()}><Abschliessen z={p.z} onZu={() => setAbschluss(false)} /></Show>
      </div>
    </Show>
  );
}

/** Abschließen (wie bisher): was im Gespräch geklärt wurde, geht – je Zeile mit Haken – in Adressen und LV; alles mit einem Rückgängig. */
function Abschliessen(p: { z: Zeile; onZu: () => void }) {
  const angebot = () => sicht.angebot?.[String(p.z.werte.angebot)];
  const zeilen = createMemo(() => { const a = angebot(), k = a ? sicht.kontakt?.[String(a.werte.bieter)] : undefined, l = sicht.lv?.[String(p.z.werte.lv)];
    return rueckweg(p.z.werte, k && !k.geloescht ? k : undefined, l && !l.geloescht ? l : undefined, a?.werte.beauftragt === true)
      .filter((x) => darf(x.objekt, 'schreiben')); });
  const [aus, setAus] = createSignal(new Set<string>());
  const ok = () => {
    const gewaehlt = zeilen().filter((x) => !aus().has(x.id)), je = new Map<string, Vorlage>();
    for (const x of gewaehlt) { const k = `${x.objekt}:${x.objektId}`; const v = je.get(k) ?? { objekt: x.objekt, art: 'aendern', objektId: x.objektId, werte: {} }; v.werte![x.feld] = x.wert; je.set(k, v); }
    ausfuehrenMehrere([{ objekt: 'besprechung', art: 'aendern', objektId: p.z.id, werte: { stand: 'abgeschlossen' } }, ...je.values()], 'Angebotsbesprechung abschließen');
    p.onZu();
  };
  return (
    <Dialog titel="Angebotsbesprechung abschließen" onAbbrechen={p.onZu}
      knoepfe={<><button type="button" class="knopf" onClick={p.onZu}>Abbrechen</button><button type="button" class="knopf haupt" onClick={ok}>Abschließen</button></>}>
      <Show when={zeilen().length} fallback={<p>Danach folgt das Protokoll den Daten nicht mehr. Aus dem Gespräch geht nichts Neues in Adressen oder LV.</p>}>
        <p>Diese Angaben aus dem Gespräch gehen beim Abschließen mit:</p>
        <ul class="bsp-rueckweg">
          <For each={zeilen()}>{(x) => (
            <li><label><input type="checkbox" checked={!aus().has(x.id)} onChange={(e) => { const n = new Set(aus()); if (e.currentTarget.checked) n.delete(x.id); else n.add(x.id); setAus(n); }} />
              <span><b>{x.titel}</b> <small class="still-text">{x.ziel}</small><br />{x.alt} → <b>{x.neu}</b></span></label></li>
          )}</For>
        </ul>
        <Show when={angebot()?.werte.beauftragt !== true}><p class="still-text klein-text">Noch nicht vergeben – die Ausführungszeit geht erst nach der Vergabe ins LV (dann wieder öffnen und erneut abschließen).</p></Show>
        <p class="still-text klein-text">Rückgängig mit Strg+Z nimmt alles zusammen zurück.</p>
      </Show>
    </Dialog>
  );
}

/** Unter den Vertragsgrundlagen (wie bisher): die Grundlagen dieses Protokolls als Vorgabe des Büros merken – gilt für neue Protokolle. */
export function GrundlagenMerken(p: { z: Zeile }) {
  const neu = () => Object.fromEntries(GRUNDLAGEN.map(([n]) => [`bv_${n}`, String(p.z.werte[n] ?? '')]));
  const gleich = () => GRUNDLAGEN.every(([n, , v]) => String(p.z.werte[n] ?? '') === (String(sicht.buero?.[BUERO_ID]?.werte[`bv_${n}`] ?? '') || v));
  return <Show when={darf('buero', 'schreiben')}>
    <button type="button" class="knopf klein" disabled={gleich()} title={gleich() ? 'So steht es schon in der Vorgabe des Büros' : 'Gilt dann für neue Angebotsbesprechungen'}
      onClick={() => { ausfuehren({ objekt: 'buero', art: 'aendern', objektId: BUERO_ID, werte: neu() }, 'Grundlagen als Vorgabe des Büros'); hinweis('Grundlagen als Vorgabe des Büros gemerkt – gilt für neue Protokolle.'); }}>Als Vorgabe des Büros merken</button>
  </Show>;
}
