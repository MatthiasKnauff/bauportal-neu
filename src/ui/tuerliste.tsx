// Fenster- & Türliste (AVA): aus dem Gebäudemodell füllen, ins LV übernehmen und das LV auf dem Stand der Liste halten.
// Die Rechnung (Gruppen, gleiche Ausführung, Systembeschreibung, Abgleich) steht in module/ava/tueren.ts.
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { Vorlage, Zeile } from '../kern/befehl';
import type { Werte } from '../kern/modell';
import { lvZeilen, maskeLesen, nummerieren, type LvZeile } from '../module/ava/lvbaum';
import { abgleichen, tuerenInsLv, type Abgleich } from '../module/ava/tueren';
import { Auswahlliste } from './baukasten/auswahlliste';
import { Dialog } from './baukasten/dialog';
import { gewaehlteVersion } from './projekt';
import { springeZu } from './sprung';
import { ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { darf, neueKennung } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';

const listenVon = (projekt: string) => lebende('tuerliste').filter((z) => z.werte.projekt === projekt).sort((a, b) => String(a.werte.name).localeCompare(String(b.werte.name), 'de'));
const tuerenVon = (liste: string) => lebende('tuer').filter((z) => z.werte.liste === liste);
const positionenVon = (lv: string) => lebende('lv_position').filter((z) => z.werte.lv === lv && !z.werte.nachtrag);
/** LVs, in denen schon Zeilen aus dieser Liste stehen. */
const verbundeneLvs = (projekt: string, liste: string) => lebende('lv').filter((l) => l.werte.projekt === projekt && positionenVon(l.id).some((p) => String(p.werte.tuerliste ?? '').split('|')[0] === liste));

/** „1,26 × 1,38 m, Brüstung 0,9 m“ → Breite, Höhe, Brüstung in m. */
function masse(t: unknown): { b?: number; h?: number; bruestung?: number } {
  const s = String(t ?? '').replace(/,/g, '.'), m = /([\d.]+)\s*[×x]\s*([\d.]+)/.exec(s), br = /Brüstung\s*([\d.]+)/.exec(s);
  return { ...(m ? { b: Number(m[1]), h: Number(m[2]) } : {}), ...(br ? { bruestung: Number(br[1]) } : {}) };
}

/** Türen und Fenster des Gebäudemodells (gewählte Version) in die Liste – nur die, die noch nicht drinstehen. */
export function ausDemModell(projekt: string, listeGewaehlt?: string): void {
  const versionen = lebende('version').filter((v) => v.werte.projekt === projekt && v.werte.bereich === 'gebaeudemodell');
  const version = versionen.find((v) => v.id === gewaehlteVersion(projekt, 'gebaeudemodell')) ?? versionen.find((v) => v.werte.gueltig) ?? versionen[0];
  const bauteile = lebende('bauteil').filter((b) => b.werte.projekt === projekt && (!version || b.werte.version === version.id) && (b.werte.art === 'tuer' || b.werte.art === 'fenster'));
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

/** Befehle, die ein LV auf den Stand der Liste bringen: neue Zeilen (an ihrer Stelle in der Gruppe), Änderungen, weggefallene auf Menge 0; dann Nummern. */
function lvBefehle(lv: Zeile, liste: string, a: Abgleich): Vorlage[] {
  const vorhanden = positionenVon(lv.id);
  const ordnung: LvZeile[] = lvZeilen(vorhanden);
  const schluessel = (id: string) => String(vorhanden.find((p) => p.id === id)?.werte.tuerliste ?? '');
  const befehle: Vorlage[] = [], neuWerte = new Map<string, Werte>();
  let letzteGruppe = new Map<string, string>();   // Gruppe → Kennung ihres Titels
  for (const z of ordnung) { const k = schluessel(z.id).split('|'); if (k[0] === liste && k.length === 2) letzteGruppe.set(k[1]!, z.id); }
  for (const z of a.neu) {
    const id = neueKennung(), [, gruppe] = z.schluessel.split('|');
    const titelId = z.art === 'titel' ? null : letzteGruppe.get(gruppe!) ?? null;
    const neueZeile: LvZeile = { id, ebene: z.art === 'titel' ? 0 : 1, titel: z.art === 'titel', oz: '', eltern: titelId };
    if (z.art === 'titel') { letzteGruppe.set(gruppe!, id); ordnung.push(neueZeile); }
    else {   // hinter die letzte Zeile derselben Gruppe
      let i = -1; ordnung.forEach((x, k) => { if (x.id === titelId || x.eltern === titelId) i = k; });
      ordnung.splice(i >= 0 ? i + 1 : ordnung.length, 0, neueZeile);
    }
    neuWerte.set(id, { projekt: lv.werte.projekt ?? null, lv: lv.id, art: z.art, kurztext: z.kurztext, langtext: z.langtext || null, menge: z.menge, einheit: z.einheit || null, tuerliste: z.schluessel });
  }
  letzteGruppe = new Map();
  const oz = nummerieren(ordnung, maskeLesen(lv.werte.oz_maske));
  for (const [id, w] of neuWerte) befehle.push({ objekt: 'lv_position', art: 'anlegen', objektId: id, werte: { ...w, oz: oz.get(id) ?? '' } });
  const aendern = new Map(a.aendern.map((x) => [x.id, { ...x.werte }]));
  for (const id of a.null) aendern.set(id, { ...aendern.get(id), menge: 0 });
  for (const [id, neu] of oz) if (!neuWerte.has(id)) aendern.set(id, { ...aendern.get(id), oz: neu });
  for (const [id, werte] of aendern) befehle.push({ objekt: 'lv_position', art: 'aendern', objektId: id, werte });
  return befehle;
}

/** Wie weit das LV vom Stand der Liste abweicht (für den Hinweis über der Liste). */
export function lvStand(projekt: string, liste: string): { lv: Zeile; offen: number }[] {
  const tueren = tuerenVon(liste);
  return verbundeneLvs(projekt, liste).map((lv) => { const a = abgleichen(tuerenInsLv(tueren, liste), positionenVon(lv.id), liste); return { lv, offen: a.neu.length + a.aendern.length + a.null.length }; });
}
/** Ein verbundenes LV auf den Stand der Liste bringen – nur, solange es nicht versandt ist (danach: Nachtrag). */
export function lvAbgleichen(lv: Zeile, liste: string): void {
  if (String(lv.werte.status ?? 'bearbeitung') !== 'bearbeitung') { hinweis(`Das LV ist ${lv.werte.status === 'versendet' ? 'versandt' : 'vergeben'} – Änderungen nach dem Versand gehen über einen Nachtrag.`, { art: 'fehler' }); return; }
  const a = abgleichen(tuerenInsLv(tuerenVon(liste), liste), positionenVon(lv.id), liste);
  const b = lvBefehle(lv, liste, a);
  if (!b.length) { hinweis('Das LV ist schon auf dem Stand der Liste.'); return; }
  ausfuehrenMehrere(b, 'LV an die Fenster- & Türliste angleichen');
  hinweis(`LV ${[lv.werte.nummer, lv.werte.name].filter(Boolean).join(' ')}: ${a.neu.length} neu, ${a.aendern.length} angepasst${a.null.length ? `, ${a.null.length} auf Menge 0 (nicht mehr in der Liste)` : ''}.`);
}

const [insLvOffen, setInsLvOffen] = createSignal(false);
/** Die Knöpfe der Ansicht (Menüleiste). */
export const tuerKnoepfe = (projekt: string) => (darf('tuer', 'schreiben') ? [
  { titel: 'Aus dem Gebäudemodell', zeichen: 'modell3d' as const, gruppe: 'Füllen', tun: () => ausDemModell(projekt) },
  { titel: 'Neue Liste', zeichen: 'neu' as const, gruppe: 'Füllen', tun: () => ausfuehrenMehrere([{ objekt: 'tuerliste', art: 'anlegen', objektId: neueKennung(), werte: { projekt, name: listenVon(projekt).length ? `Türliste ${listenVon(projekt).length + 1}` : 'Fenster- & Türliste' } }], 'Neue Türliste') },
  ...(darf('lv_position', 'schreiben') ? [{ titel: 'Ins LV …', zeichen: 'ausschreibung' as const, gruppe: 'LV', tun: () => setInsLvOffen(true) }] : []),
] : []);

/** Über der Liste: welche LVs aus ihr gespeist werden und ob sie auf dem Stand sind. */
export function TuerlisteOben(p: { projekt: string }) {
  const liste = () => listenVon(p.projekt)[0]?.id;
  const stand = createMemo(() => (liste() ? lvStand(p.projekt, liste()!) : []));
  return (<>
    <Show when={insLvOffen()}><InsLv projekt={p.projekt} zu={() => setInsLvOffen(false)} /></Show>
    <Show when={stand().length}>
      <div class="hinweis-leiste">
        <For each={stand()}>{(s) => (
          <span>LV {[s.lv.werte.nummer, s.lv.werte.name].filter(Boolean).join(' · ')}: {s.offen ? `${s.offen} ${s.offen === 1 ? 'Änderung' : 'Änderungen'} aus der Liste noch nicht im LV` : 'auf dem Stand der Liste'}
            <Show when={s.offen && darf('lv_position', 'schreiben')}> <button type="button" class="knopf klein" onClick={() => lvAbgleichen(s.lv, liste()!)}>Abgleichen</button></Show>
            {' '}<button type="button" class="knopf klein still" onClick={() => springeZu('lv', s.lv.id, { modul: 'ava', ansicht: 'lv' })}>Zum LV</button></span>)}</For>
      </div>
    </Show>
  </>);
}

/** „Ins LV“: an ein LV anhängen (oder es angleichen, wenn es schon Positionen aus der Liste hat) oder ein neues LV anlegen. */
export function InsLv(p: { projekt: string; zu: () => void }) {
  const listen = () => listenVon(p.projekt);
  const [liste, setListe] = createSignal(listen()[0]?.id ?? '');
  const lvs = () => lebende('lv').filter((l) => l.werte.projekt === p.projekt && String(l.werte.status ?? 'bearbeitung') === 'bearbeitung');
  const [ziel, setZiel] = createSignal<string>(verbundeneLvs(p.projekt, liste())[0]?.id ?? '');
  const tueren = () => tuerenVon(liste());
  const plan = createMemo(() => tuerenInsLv(tueren(), liste()));
  const ok = () => {
    if (!tueren().length) { hinweis('In der Liste stehen noch keine Türen.', { art: 'fehler' }); return; }
    if (ziel()) { p.zu(); lvAbgleichen(sicht.lv![ziel()]!, liste()); return; }
    const lvId = neueKennung(), nr = String(lebende('lv').filter((l) => l.werte.projekt === p.projekt).length + 1).padStart(2, '0');
    const lv = { id: lvId, werte: { projekt: p.projekt, nummer: nr, name: 'Fenster und Türen', status: 'bearbeitung' } } as unknown as Zeile;
    const a = abgleichen(plan(), [], liste());
    ausfuehrenMehrere([{ objekt: 'lv', art: 'anlegen', objektId: lvId, werte: lv.werte }, ...lvBefehle(lv, liste(), a)], 'Neues LV aus der Fenster- & Türliste');
    p.zu();
    hinweis(`${tueren().length} Türen/Fenster → ${plan().filter((z) => z.art === 'normal').length} Positionen im neuen LV „Fenster und Türen“. Systembeschreibung und Preise jetzt im LV ergänzen.`);
    springeZu('lv', lvId, { modul: 'ava', ansicht: 'lv' });
  };
  return (
    <Dialog titel="Ins LV übernehmen" onAbbrechen={p.zu}
      knoepfe={<><button class="knopf" onClick={p.zu}>Abbrechen</button><button class="knopf haupt" disabled={!tueren().length} onClick={ok}>Übernehmen</button></>}>
      <div class="formular">
        <Show when={listen().length > 1}><Auswahlliste titel="Liste" wert={liste()} optionen={listen().map((l) => ({ wert: l.id, titel: String(l.werte.name) }))} onWert={(w) => { setListe(w); setZiel(verbundeneLvs(p.projekt, w)[0]?.id ?? ''); }} /></Show>
        <Auswahlliste titel="Ziel" wert={ziel()} onWert={setZiel}
          optionen={[{ wert: '', titel: 'Neues LV „Fenster und Türen“ anlegen' }, ...lvs().map((l) => ({ wert: l.id, titel: `${verbundeneLvs(p.projekt, liste()).some((x) => x.id === l.id) ? 'angleichen' : 'anhängen an'}: LV ${[l.werte.nummer, l.werte.name].filter(Boolean).join(' · ')}` }))]} />
        <p class="still-text">{tueren().length} Türen/Fenster → {plan().filter((z) => z.art === 'normal').length} Positionen. Gleiche Ausführung wird eine Position (Menge = Stückzahl); je Gruppe (Fenster, Außentüren, Innentüren) ein Titel mit Systembeschreibung. Angleichen: geänderte Mengen und Texte werden angepasst, neue Ausführungen kommen dazu, weggefallene bekommen Menge 0 – OZ, Preise und Vergabe bleiben.</p>
      </div>
    </Dialog>
  );
}
