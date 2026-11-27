// LV aus einer Quelle speisen – ein Baustein für die Fenster- & Türliste und das Gebäudemodell: neue Zeilen an ihre Stelle,
// geänderte Mengen und Texte anpassen, weggefallene auf Menge 0, dann nummerieren. Die Rechnung steht in module/ava/lvplan.ts.
// Über dem LV zeigt die Leiste, welche Quellen es speisen und ob es auf ihrem Stand ist.
import { For, Show, createMemo } from 'solid-js';
import type { Vorlage, Zeile } from '../kern/befehl';
import type { Werte } from '../kern/modell';
import { lvZeilen, maskeLesen, nummerieren, type LvZeile } from '../module/ava/lvbaum';
import { abgleichen, quelleVon, teilplan, type Abgleich, type LvZeilePlan } from '../module/ava/lvplan';
import { MODELL, bauteileInsLv } from '../module/ava/modellplan';
import { insLvArt, tuerenInsLv } from '../module/ava/tueren';
import { gewaehlteVersion } from './projekt';
import { ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { darf, neueKennung } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';

/** Eine Quelle: `teil` – das LV gleicht nur ab, was es von ihr übernommen hat (das Modell geht auf mehrere LVs). */
export interface LvQuelle { id: string; titel: string; plan: () => LvZeilePlan[]; teil?: boolean }

export const positionenVon = (lv: string) => lebende('lv_position').filter((z) => z.werte.lv === lv && !z.werte.nachtrag);

/** Bauteile der gewählten (sonst gültigen) Version des Gebäudemodells. */
export function modellBauteile(projekt: string): Zeile[] {
  const versionen = lebende('version').filter((v) => v.werte.projekt === projekt && v.werte.bereich === 'gebaeudemodell');
  const version = versionen.find((v) => v.id === gewaehlteVersion(projekt, 'gebaeudemodell')) ?? versionen.find((v) => v.werte.gueltig) ?? versionen[0];
  return lebende('bauteil').filter((b) => b.werte.projekt === projekt && (!version || b.werte.version === version.id));
}
export const modellQuelle = (projekt: string): LvQuelle => ({
  id: MODELL, titel: 'dem Gebäudemodell', teil: true,
  plan: () => bauteileInsLv(modellBauteile(projekt), sicht.aufbau ?? {}, lebende('aufbau_schicht'), sicht.kostengruppe ?? {}),
});
export const tuerQuelle = (liste: Zeile): LvQuelle => ({
  id: liste.id, titel: `der ${String(liste.werte.name ?? 'Türliste')}`,
  plan: () => tuerenInsLv(lebende('tuer').filter((z) => z.werte.liste === liste.id), liste.id, insLvArt(sicht.tuerliste?.[liste.id]?.werte ?? liste.werte)),
});
/** Alle Quellen, die ein LV des Projekts speisen können. */
export const quellenVon = (projekt: string): LvQuelle[] => [modellQuelle(projekt), ...lebende('tuerliste').filter((l) => l.werte.projekt === projekt).map(tuerQuelle)];

const planFuer = (lv: Zeile, q: LvQuelle, gewaehlt?: Set<string>) => (q.teil ? teilplan(q.plan(), positionenVon(lv.id), q.id, gewaehlt) : q.plan());
export const lvAbgleich = (lv: Zeile, q: LvQuelle, gewaehlt?: Set<string>): Abgleich => abgleichen(planFuer(lv, q, gewaehlt), positionenVon(lv.id), q.id);

/** Gleiche Segmente am Anfang zweier Schlüssel. */
const gemeinsam = (a: string, b: string) => { const x = a.split('|'), y = b.split('|'); let i = 0; while (i < x.length && x[i] === y[i]) i++; return i; };

/** Befehle, die ein LV auf den Stand der Quelle bringen. Eine neue Zeile kommt hinter die letzte Zeile mit dem ähnlichsten Schlüssel
 *  (gleicher Titel, gleicher Aufbau …) und unter deren Titel; ein neuer Titel ans Ende. Danach wird nummeriert. */
function lvBefehle(lv: Zeile, a: Abgleich): Vorlage[] {
  const vorhanden = positionenVon(lv.id), ordnung: LvZeile[] = lvZeilen(vorhanden);
  const schluessel = new Map<string, string>(vorhanden.map((p) => [p.id, String(p.werte.quelle ?? '')]));
  const neuWerte = new Map<string, Werte>();
  for (const z of a.neu) {
    const id = neueKennung();
    let nach = -1, bester = 2;   // mindestens Quelle und Titel gleich; bei Gleichstand die letzte Zeile
    ordnung.forEach((x, i) => { const g = gemeinsam(schluessel.get(x.id) ?? '', z.schluessel); if (g >= bester) { bester = g; nach = i; } });
    // ein Titel kommt unter den Titel, dessen Schlüssel vor seinem steht (z. B. Gruppe unter Obertitel), ans Ende von dessen Abschnitt
    const oben = z.art === 'titel' ? [...ordnung].reverse().find((x) => x.titel && z.schluessel.startsWith(`${schluessel.get(x.id)}|`)) : undefined;
    if (oben) { const unter = new Set([oben.id]); ordnung.forEach((x, i) => { if (x.eltern && unter.has(x.eltern)) { unter.add(x.id); nach = i; } }); if (nach < 0 || !unter.has(ordnung[nach]!.id)) nach = ordnung.indexOf(oben); }
    const vor = oben ? ordnung[nach]! : z.art === 'titel' || nach < 0 ? null : ordnung[nach]!;
    // unter den Titel der Nachbarzeile – oder unter sie selbst, wenn sie der Titel dieser Zeile ist
    const titel = oben ? oben.id : vor ? (vor.titel && z.schluessel.startsWith(`${schluessel.get(vor.id)}|`) ? vor.id : vor.eltern) : null;
    const zeile: LvZeile = { id, ebene: titel ? (ordnung.find((x) => x.id === titel)?.ebene ?? 0) + 1 : 0, titel: z.art === 'titel', oz: '', eltern: titel };
    if (vor) ordnung.splice(nach + 1, 0, zeile); else ordnung.push(zeile);
    schluessel.set(id, z.schluessel);
    neuWerte.set(id, { projekt: lv.werte.projekt ?? null, lv: lv.id, art: z.art, kurztext: z.kurztext, langtext: z.langtext || null, menge: z.menge, einheit: z.einheit || null, quelle: z.schluessel });
  }
  const oz = nummerieren(ordnung, maskeLesen(lv.werte.oz_maske));
  const befehle: Vorlage[] = [...neuWerte].map(([id, w]) => ({ objekt: 'lv_position', art: 'anlegen' as const, objektId: id, werte: { ...w, oz: oz.get(id) ?? '' } }));
  const aendern = new Map(a.aendern.map((x) => [x.id, { ...x.werte }]));
  for (const id of a.null) aendern.set(id, { ...aendern.get(id), menge: 0 });
  for (const [id, neu] of oz) if (!neuWerte.has(id)) aendern.set(id, { ...aendern.get(id), oz: neu });
  for (const [id, werte] of aendern) befehle.push({ objekt: 'lv_position', art: 'aendern', objektId: id, werte });
  return befehle;
}

/** Ein neues LV (noch nicht angelegt – der Befehl läuft mit dem Abgleich in einem Vorgang). */
export function neuesLv(projekt: string, name: string): Zeile {
  const nr = String(lebende('lv').filter((l) => l.werte.projekt === projekt).length + 1).padStart(2, '0');
  return { id: neueKennung(), werte: { projekt, nummer: nr, name, status: 'bearbeitung' } } as unknown as Zeile;
}

export const lvName = (lv: Zeile) => [lv.werte.nummer, lv.werte.name].filter(Boolean).join(' · ');

/** Ein LV auf den Stand der Quelle bringen (mit `gewaehlt` kommen diese Zeilen dazu) – nur, solange es nicht versandt ist (danach: Nachtrag).
 *  `davor`: Befehle, die im selben Vorgang vorher laufen (z. B. das neue LV anlegen). */
export function lvAbgleichen(lv: Zeile, q: LvQuelle, gewaehlt?: Set<string>, davor: Vorlage[] = []): boolean {
  if (String(lv.werte.status ?? 'bearbeitung') !== 'bearbeitung') { hinweis(`Das LV ist ${lv.werte.status === 'versendet' ? 'versandt' : 'vergeben'} – Änderungen nach dem Versand gehen über einen Nachtrag.`, { art: 'fehler' }); return false; }
  const a = lvAbgleich(lv, q, gewaehlt), b = lvBefehle(lv, a);
  if (!b.length && !davor.length) { hinweis(`Das LV ist schon auf dem Stand ${q.titel}.`); return false; }
  ausfuehrenMehrere([...davor, ...b], `LV an ${q.titel} angleichen`);
  const pos = a.neu.filter((z) => z.art === 'normal').length;
  hinweis(`LV ${lvName(lv)}: ${pos} ${pos === 1 ? 'Position' : 'Positionen'} neu, ${a.aendern.length} angepasst${a.null.length ? `, ${a.null.length} auf Menge 0 (nicht mehr in ${q.titel})` : ''}.`);
  return true;
}

/** Wie viele Änderungen der Quelle noch nicht im LV sind. */
export function offenIm(lv: Zeile, q: LvQuelle): number { const a = lvAbgleich(lv, q); return a.neu.length + a.aendern.length + a.null.length; }

/** Über dem LV: aus welchen Quellen es gespeist wird und ob es auf ihrem Stand ist. */
export function LvQuellenLeiste(p: { lv: Zeile }) {
  const stand = createMemo(() => {
    const da = new Set(positionenVon(p.lv.id).map(quelleVon).filter(Boolean));
    return quellenVon(String(p.lv.werte.projekt)).filter((q) => da.has(q.id)).map((q) => ({ q, offen: offenIm(p.lv, q) }));
  });
  const darfAbgleichen = () => darf('lv_position', 'schreiben') && String(p.lv.werte.status ?? 'bearbeitung') === 'bearbeitung';
  return (
    <Show when={stand().length}>
      <div class="hinweis-leiste lvt-quellen">
        <For each={stand()}>{(s) => (
          <span>Aus {s.q.titel}: {s.offen ? `${s.offen} ${s.offen === 1 ? 'Änderung' : 'Änderungen'} noch nicht im LV` : 'auf dem Stand'}
            <Show when={s.offen && darfAbgleichen()}> <button type="button" class="knopf klein" onClick={() => lvAbgleichen(p.lv, s.q)}>Abgleichen</button></Show></span>)}</For>
      </div>
    </Show>
  );
}
