// Angebotsbesprechung in der Oberfläche: anlegen bzw. öffnen an der Karte des Angebots; an der Karte des Protokolls der
// Abgleich mit den Daten (solange Entwurf) und Abschließen. Die Rechnung „Protokoll aus den Daten“ steht in
// module/ava/besprechung.ts; hier werden nur die Quellen zusammengesucht und die Befehle geschickt.
import { For, Show, createMemo } from 'solid-js';
import type { Vorlage, Zeile } from '../kern/befehl';
import type { Werte } from '../kern/modell';
import { abgleich, ausDenDaten, type Quellen } from '../module/ava/besprechung';
import { vertragAusDaten } from '../module/ava/vertrag';
import { lvZahlen } from './ava';
import { einsatzAus } from '../module/bauzeitenplan/gewerke';
import { isoAus } from '../module/bauzeitenplan/kalender';
import { BUERO_ID } from '../module/verwaltung/beipackzettel';
import { ausfuehren, ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { darf, ich, modell, neueKennung } from './unterbau/api';
import { aktuelleVersion, planDerVersion } from './plandaten';
import { springeZu } from './sprung';

const kurz = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

/** Die Quellen eines Angebots: Projekt, Büro, Bieter:in, Angebot, LV und die Termine des Gewerks im Bauzeitenplan. */
function quellen(angebot: Werte): Quellen {
  const lv = sicht.lv?.[String(angebot.lv)]?.werte, projekt = String(angebot.projekt ?? '');
  const kg = lv?.kostengruppe ? sicht.kostengruppe?.[String(lv.kostengruppe)]?.werte : undefined;
  const q: Quellen = {
    projekt: sicht.projekt?.[projekt]?.werte, buero: sicht.buero?.[BUERO_ID]?.werte, bieter: sicht.kontakt?.[String(angebot.bieter)]?.werte, angebot, lv,
    gewerkName: lv?.gewerk ? String(sicht.gewerk?.[String(lv.gewerk)]?.werte.name ?? '') : '', kostengruppe: kg ? String(kg.nummer ?? '') : '',
  };
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
  const werte = vertragAusDaten({ agArt: 'unternehmen', projekt: q.projekt, bieter: q.bieter, lv: q.lv, angebot: a, gewerkName: q.gewerkName, summe: lvZahlen(String(a.lv)).haupt, protokoll: protokoll?.werte });
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
            <button type="button" class="knopf klein" onClick={() => aendern({ stand: 'abgeschlossen' }, 'Angebotsbesprechung abschließen')}>Abschließen</button></div>
        </Show>
      </div>
    </Show>
  );
}
