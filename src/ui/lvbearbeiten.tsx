// LV bearbeiten (wie im bisherigen Bauportal): das Leistungsverzeichnis als Baum – Titel mit ihren Positionen, Zellen direkt
// bearbeiten (Enter eine Zeile tiefer, Tab zur nächsten Spalte), Langtext unter der Zeile aufklappen, Titel- und LV-Summen.
// Neu: Titel und Position unter der markierten Zeile; Nummerieren nach der OZ-Maske; Kontextmenü; Auswahl wie in Windows
// (Baustein Zeilenwahl); Spalten wählen, ordnen und passend machen (Baustein Spaltenwahl). Nach der Vergabe ist das LV gesperrt –
// 🔒 schaltet es bis zum Neuladen frei (Positionen sind dann Vertragsinhalt).
import { For, Show, createEffect, createMemo, createSignal, type JSX } from 'solid-js';
import type { Wert } from '../kern/modell';
import { gliederungEinfuegen, lvZeilen, maskeLesen, maskeSchreiben, neueOz, nummerieren, titelSumme, verschieben, type LvZeile, type OzMaske } from '../module/ava/lvbaum';
import { Dialog } from './baukasten/dialog';
import { langtextMenue, ErgaenzungFenster } from './textergaenzung';
import { LvQuellenLeiste } from './lvquelle';
import { ModellInsLv } from './modellinslv';
import { NeuesLv } from './neueslv';
import { projektId } from './projekt';
import { gp, zaehlt, zahl } from '../module/ava/rechnung';
import { lvVon, lvWaehlen } from './avakopf';
import { druckOeffnen } from './druck';
import type { Mitte } from './baukasten/anpassung';
import { Klappe, Ordner } from './baukasten/baum';
import { zeigeMenue } from './baukasten/kontextmenue';
import { spaltenwahl, zusatzMessen } from './baukasten/spalten';
import { zeilenwahl } from './baukasten/zeilenwahl';
import { ausfuehren, ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { darf, neueKennung } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';

type Sp = 'oz' | 'kurztext' | 'menge' | 'einheit' | 'art' | 'ep' | 'gp';
const SPALTEN: { id: Sp; titel: string; breite: number; rechts?: boolean }[] = [
  { id: 'oz', titel: 'OZ', breite: 130 }, { id: 'kurztext', titel: 'Kurztext', breite: 360 }, { id: 'menge', titel: 'Menge', breite: 90, rechts: true },
  { id: 'einheit', titel: 'Einheit', breite: 70 }, { id: 'art', titel: 'Art', breite: 60 }, { id: 'ep', titel: 'EP geschätzt', breite: 110, rechts: true },
  { id: 'gp', titel: 'GP', breite: 120, rechts: true },
];
const BEARBEITBAR = new Set<Sp>(['oz', 'kurztext', 'menge', 'einheit', 'art', 'ep']);
/** Kurzzeichen der Art wie im bisherigen Bauportal: N Normal · E Bedarf · A Wahl · P Pauschal · S Stundenlohn · H Hinweistext. */
const ART_KURZ: Record<string, string> = { normal: 'N', bedarf: 'E', alternativ: 'A', pauschal: 'P', stundenlohn: 'S', hinweis: 'H', titel: '' };
const ART_AUS = Object.fromEntries(Object.entries(ART_KURZ).filter(([, k]) => k).map(([w, k]) => [k, w]));
const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const zahlText = (w: unknown) => (w === null || w === undefined || w === '' ? '' : zahl(w).toLocaleString('de-DE', { maximumFractionDigits: 3 }));
const FREI = new Set<string>();   // freigeschaltete vergebene LVs – bis zum Neuladen
/** Die markierte Zeile – rechts steht dann ihre Karte (Eigenschaften der Position, wie im bisherigen Bauportal). */
export const [lvZeiger, setLvZeiger] = createSignal<string | null>(null);

export function LvBearbeiten(p: Mitte): JSX.Element {
  const lv = () => lvVon(p);
  const positionen = createMemo(() => (lv() ? lebende('lv_position').filter((x) => x.werte.lv === lv()!.id && !x.werte.nachtrag) : []));
  const zeilen = createMemo(() => lvZeilen(positionen()));
  const nachZeile = createMemo(() => new Map(zeilen().map((z) => [z.id, z])));   // Zeilen über ihre Kennung – die Darstellung hängt an der Kennung, nicht am Objekt (sonst ginge ein offenes Feld bei jedem Abgleich verloren)
  const nachId = (id: string) => sicht.lv_position?.[id];
  const [zu, setZu] = createSignal<Set<string>>(new Set());
  const [lang, setLang] = createSignal<Set<string>>(new Set());
  const sichtbar = createMemo(() => { const aus: LvZeile[] = [], weg = new Set<string>(); for (const z of zeilen()) { if (z.eltern && (weg.has(z.eltern) || zu().has(z.eltern))) { weg.add(z.id); continue; } aus.push(z); } return aus; });
  const [frei, setFrei] = createSignal(0);
  const maske = () => maskeLesen(lv()?.werte.oz_maske);
  const vergeben = () => lv()?.werte.status === 'vergeben' || lv()?.werte.status === 'abgerechnet';
  const gesperrt = () => { frei(); return vergeben() && !FREI.has(lv()?.id ?? ''); };
  const schreiben = () => darf('lv_position', 'schreiben') && !gesperrt();
  const wahl = zeilenwahl({ reihe: () => zeilen().map((z) => z.id), sichtbar: () => sichtbar().map((z) => z.id), onZeiger: (id) => { setLvZeiger(id); if (id && !p.gewaehlt() && lv()) p.onWahl(lv()!.id); } });
  const spw = spaltenwahl('bp_spalten_lv', SPALTEN.map((x) => ({ ...x, name: x.id, inListe: true, fest: x.id === 'oz' || x.id === 'kurztext' })));
  const spalten = () => spw.sichtbare().map((x) => ({ ...x, breite: spw.breite(x) }));
  const gpVon = (id: string) => { const z = nachId(id); return z && zaehlt(z) ? gp(z.werte.menge, z.werte.ep) : null; };
  const summe = () => Math.round(zeilen().filter((z) => !z.titel).reduce((s, z) => s + (gpVon(z.id) ?? 0), 0) * 100) / 100;
  const wert = (z: LvZeile, s: Sp): string => {
    const w = nachId(z.id)?.werte ?? {};
    switch (s) {
      case 'oz': return z.oz;
      case 'kurztext': return String(w.kurztext ?? '');
      case 'menge': return z.titel ? '' : zahlText(w.menge);
      case 'einheit': return z.titel ? '' : String(w.einheit ?? '');
      case 'art': return ART_KURZ[String(w.art ?? 'normal')] ?? '';
      case 'ep': return z.titel || w.ep === null || w.ep === undefined || w.ep === '' ? '' : eur(zahl(w.ep));
      case 'gp': return z.titel ? eur(titelSumme(zeilen(), z.id, gpVon)) : gpVon(z.id) === null ? (w.art === 'hinweis' ? '' : 'ohne GP') : eur(gpVon(z.id)!);
    }
  };
  // ---------- Zellen bearbeiten ----------
  const [edit, setEdit] = createSignal<{ id: string; spalte: Sp; text: string; alles?: boolean } | null>(null);   // alles: Text markiert (neue Zeile – Tippen ersetzt den Vorschlag)
  const [spalte, setSpalte] = createSignal<Sp>('kurztext');
  const aendern = (id: string, werte: Record<string, Wert>, titel: string) => ausfuehren({ objekt: 'lv_position', art: 'aendern', objektId: id, werte }, titel);
  const uebernehmen = (): boolean => {
    const e = edit(); if (!e) return true;
    const z = zeilen().find((x) => x.id === e.id), alt = wert(z!, e.spalte), t = e.text.trim();
    if (t === alt) { setEdit(null); return true; }
    if (e.spalte === 'menge' || e.spalte === 'ep') {
      if (t && !/^-?[\d.]*,?\d*$/.test(t.replace(/\s/g, ''))) { hinweis('Bitte eine Zahl eintragen, z. B. 12,5', { art: 'fehler' }); return false; }
      aendern(e.id, { [e.spalte]: t ? zahl(t) : null }, e.spalte === 'menge' ? 'Menge' : 'Einheitspreis');
    } else if (e.spalte === 'art') {
      const w = ART_AUS[t.toUpperCase()]; if (!w) { hinweis('Art: N Normal · E Bedarf · A Wahl · P Pauschal · S Stundenlohn · H Hinweistext', { art: 'fehler' }); return false; }
      aendern(e.id, { art: w }, 'Art');
    } else if (e.spalte === 'oz') {
      if (!t) { hinweis('Die OZ darf nicht leer sein.', { art: 'fehler' }); return false; }
      if (zeilen().some((x) => x.oz === t && x.id !== e.id)) { hinweis(`Die OZ ${t} gibt es schon.`, { art: 'fehler' }); return false; }
      aendern(e.id, { oz: t }, 'OZ');
    } else aendern(e.id, { [e.spalte]: t }, e.spalte === 'kurztext' ? 'Kurztext' : 'Einheit');
    setEdit(null); return true;
  };
  const bearbeiten = (id: string, s: Sp, text?: string, alles = false) => {
    const z = zeilen().find((x) => x.id === id); if (!z || !schreiben() || !BEARBEITBAR.has(s) || (z.titel && !['oz', 'kurztext'].includes(s))) return;
    setSpalte(s); wahl.setMarkiert(id); setEdit({ id, spalte: s, text: text ?? (s === 'ep' ? zahlText(nachId(id)?.werte.ep) : wert(z, s)), alles });
  };
  // ---------- neue Zeilen, löschen, nummerieren ----------
  const neu = (titel: boolean) => {
    if (!schreiben() || !lv()) return;
    const nach = wahl.markiert(), id = neueKennung(), oz = neueOz(zeilen(), { nach, titel }, maske());
    ausfuehren({ objekt: 'lv_position', art: 'anlegen', objektId: id, werte: { projekt: lv()!.werte.projekt ?? null, lv: lv()!.id, oz, art: titel ? 'titel' : 'normal', kurztext: titel ? 'Neuer Gliederungspunkt' : 'Neue Position', menge: null, einheit: titel ? '' : 'Stk', ep: null } }, titel ? 'Titel einfügen' : 'Position einfügen');
    wahl.setMarkiert(id); queueMicrotask(() => bearbeiten(id, 'kurztext', undefined, true));
  };
  /** Neuer Gliederungspunkt eine Ebene unter der markierten Zeile – gewählte Positionen kommen hinein (wie bisher). */
  const gliederung = () => {
    if (!schreiben() || !lv()) return;
    const id = neueKennung(), r = gliederungEinfuegen(zeilen(), id, wahl.markiert(), wahl.gewaehlt(), maske().titel.length);
    if (typeof r === 'string') { hinweis(r, { art: 'fehler' }); return; }
    const oz = nummerieren(r, maske()), mit = r.filter((z) => z.eltern === id).length;
    ausfuehrenMehrere([{ objekt: 'lv_position', art: 'anlegen', objektId: id, werte: { projekt: lv()!.werte.projekt ?? null, lv: lv()!.id, oz: oz.get(id) ?? '', art: 'titel', kurztext: 'Neuer Gliederungspunkt' } },
      ...[...oz].filter(([k]) => k !== id).map(([k, v]) => ({ objekt: 'lv_position', art: 'aendern' as const, objektId: k, werte: { oz: v } }))], mit ? `Gliederungspunkt mit ${mit} ${mit === 1 ? 'Position' : 'Positionen'}` : 'Gliederungspunkt einfügen');
    if (mit) hinweis(`${mit === 1 ? 'Die Position steht' : `Die ${mit} Positionen stehen`} jetzt unter ${oz.get(id)} – rückgängig mit Strg+Z.`);
    wahl.setMarkiert(id); queueMicrotask(() => bearbeiten(id, 'kurztext', undefined, true));
  };
  const loeschen = () => {
    const ids = new Set(wahl.gewaehlt()); if (!ids.size || !darf('lv_position', 'loeschen') || gesperrt()) return;
    // ein Titel nimmt alles darunter mit
    for (const z of zeilen()) if (z.eltern && ids.has(z.eltern)) ids.add(z.id);
    ausfuehrenMehrere([...ids].map((id) => ({ objekt: 'lv_position', art: 'loeschen' as const, objektId: id })), ids.size === 1 ? 'Zeile löschen' : `${ids.size} Zeilen löschen`);
    hinweis(`${ids.size === 1 ? 'Zeile' : `${ids.size} Zeilen`} gelöscht.`);
    wahl.setMarkiert(null);
  };
  // Nummerieren mit der OZ-Maske des LV (im Fenster einstellbar, wird am LV gemerkt)
  const [numFenster, setNumFenster] = createSignal(false);
  const neuNummerieren = (m: OzMaske) => {
    const n = nummerieren(zeilen(), m), alt = String(lv()?.werte.oz_maske ?? ''), neuM = maskeSchreiben(m);
    if (!n.size && alt === neuM) { hinweis('Die Ordnungszahlen stimmen schon.'); return; }
    ausfuehrenMehrere([...(alt !== neuM ? [{ objekt: 'lv', art: 'aendern' as const, objektId: lv()!.id, werte: { oz_maske: neuM } }] : []),
      ...[...n].map(([id, oz]) => ({ objekt: 'lv_position', art: 'aendern' as const, objektId: id, werte: { oz } }))], 'Nummerieren');
    hinweis(n.size ? `${n.size} Ordnungszahl${n.size === 1 ? '' : 'en'} neu vergeben.` : 'OZ-Maske gemerkt – die Ordnungszahlen passen schon.');
  };
  const [vorbem, setVorbem] = createSignal(false);
  // ---------- Zeilen ziehen (an der OZ greifen) und Zwischenablage (Strg+C/X/V) ----------
  const ozSetzen = (neu: Map<string, string>, titel: string) => { if (neu.size) ausfuehrenMehrere([...neu].map(([id, oz]) => ({ objekt: 'lv_position', art: 'aendern' as const, objektId: id, werte: { oz } })), titel); };
  const [zug, setZug] = createSignal<{ ids: string[]; nach: string | null; y: number } | null>(null);
  const zugStart = (e: PointerEvent, id: string) => {
    if (e.button !== 0 || !schreiben()) return;
    e.preventDefault(); e.stopPropagation();
    if (!wahl.istGewaehlt(id)) wahl.setMarkiert(id);
    const ids = wahl.gewaehlt(), y0 = e.clientY;
    const ziel = (ev: PointerEvent) => {
      const r = (document.elementFromPoint(ev.clientX, ev.clientY) as Element | null)?.closest<HTMLElement>('.lvt-zeile[data-id]');
      if (!r) return null;
      const b = r.getBoundingClientRect(), unten = ev.clientY > b.top + b.height / 2, l = sichtbar(), i = l.findIndex((z) => z.id === r.dataset.id);
      return { nach: unten ? r.dataset.id! : l[i - 1]?.id ?? null, y: (unten ? b.bottom : b.top) - flaeche.getBoundingClientRect().top + flaeche.scrollTop };
    };
    const bewegt = (ev: PointerEvent) => { if (Math.abs(ev.clientY - y0) < 4 && !zug()) return; const z = ziel(ev); if (z) setZug({ ids, ...z }); };
    const los = () => {
      removeEventListener('pointermove', bewegt); removeEventListener('pointerup', los);
      const z = zug(); setZug(null); if (!z) return;
      const neu = verschieben(zeilen(), z.ids, z.nach, maske());
      if (!neu.size) { hinweis('Dorthin geht es nicht – ein Titel lässt sich nicht in sich selbst ziehen.', { art: 'fehler' }); return; }
      ozSetzen(neu, z.ids.length === 1 ? 'Zeile verschieben' : `${z.ids.length} Zeilen verschieben`);
    };
    addEventListener('pointermove', bewegt); addEventListener('pointerup', los);
  };
  type Ablage = { titel: boolean; oz: string; werte: Record<string, Wert> }[];
  const KOPIERT = ['art', 'kurztext', 'langtext', 'menge', 'einheit', 'ep'];
  const kopieren = (weg = false) => {
    const ids = new Set(wahl.gewaehlt()); if (!ids.size) return;
    for (const z of zeilen()) if (z.eltern && ids.has(z.eltern)) ids.add(z.id);
    const a: Ablage = zeilen().filter((z) => ids.has(z.id)).map((z) => ({ titel: z.titel, oz: z.oz, werte: Object.fromEntries(KOPIERT.map((f) => [f, (nachId(z.id)?.werte[f] ?? null) as Wert])) }));
    try { localStorage.setItem('bp.lv.ablage', JSON.stringify(a)); } catch { /* ohne Speicher */ }
    if (weg) loeschen(); else hinweis(`${a.length === 1 ? 'Zeile' : `${a.length} Zeilen`} kopiert – Strg+V fügt sie unter der markierten ein.`);
  };
  const einfuegen = () => {
    let a: Ablage = []; try { a = JSON.parse(localStorage.getItem('bp.lv.ablage') ?? '[]') as Ablage; } catch { /* unlesbar */ }
    if (!a.length || !schreiben() || !lv()) return;
    // vorläufige OZ „~k…“ (Gliederung bleibt), dann wie beim Ziehen hinter die markierte Zeile
    const wurzeln = a.filter((x) => !a.some((t) => t.titel && t !== x && x.oz.startsWith(`${t.oz}.`)));
    const neueIds = a.map(() => neueKennung()), vorl = a.map((x) => { const w = wurzeln.findIndex((r) => r === x || x.oz.startsWith(`${r.oz}.`)); return `~${w}${x.oz.slice(wurzeln[w]!.oz.length)}`; });
    const tmp = lvZeilen([...zeilen().map((z) => ({ id: z.id, werte: { oz: z.oz, art: z.titel ? 'titel' : 'normal' } })), ...a.map((x, i) => ({ id: neueIds[i]!, werte: { oz: vorl[i]!, art: x.titel ? 'titel' : 'normal' } }))]);
    const oz = verschieben(tmp, wurzeln.map((r) => neueIds[a.indexOf(r)]!), wahl.markiert(), maske());
    ausfuehrenMehrere(a.map((x, i) => ({ objekt: 'lv_position', art: 'anlegen' as const, objektId: neueIds[i]!, werte: { ...x.werte, projekt: lv()!.werte.projekt ?? null, lv: lv()!.id, oz: oz.get(neueIds[i]!) ?? vorl[i]! } })), a.length === 1 ? 'Zeile einfügen' : `${a.length} Zeilen einfügen`);
    wahl.mehrere(neueIds);
  };
  const [modellFenster, setModellFenster] = createSignal(false);
  const [neuFenster, setNeuFenster] = createSignal(false);
  p.setNeu(() => setNeuFenster(true));   // „LV“ unter Neu: Womit anfangen? (statt der leeren Karte)
  const freischalten = () => { const id = lv()?.id; if (!id) return; if (FREI.has(id)) FREI.delete(id); else FREI.add(id); setFrei(frei() + 1); };
  createEffect(() => p.setKnoepfe([
    ...(darf('lv_position', 'schreiben') && lv() ? [{ titel: 'Gliederung', zeichen: 'gruppe_neu', gruppe: 'Neu', gesperrt: gesperrt(), tun: gliederung },
      { titel: 'Position', zeichen: 'neu', gruppe: 'Neu', gesperrt: gesperrt(), tun: () => neu(false) },
      { titel: 'Aus dem Gebäudemodell …', zeichen: 'modell3d', gruppe: 'Neu', gesperrt: String(lv()!.werte.status ?? 'bearbeitung') !== 'bearbeitung', tun: () => setModellFenster(true) },
      { titel: 'Nummerieren …', zeichen: 'liste', gruppe: 'Bearbeiten', gesperrt: gesperrt() || !zeilen().length, tun: () => setNumFenster(true) },
      { titel: 'Löschen', zeichen: 'loeschen', rot: true, gruppe: 'Bearbeiten', gesperrt: gesperrt() || !wahl.markiert(), tun: loeschen }] : []),
    ...(lv() ? [{ titel: 'Vorbemerkungen', zeichen: 'bericht', gruppe: 'Ansicht', an: vorbem(), tun: () => setVorbem(!vorbem()) }] : []),
    ...(lv() ? [{ titel: 'Langtexte', zeichen: 'notiz', gruppe: 'Ansicht', an: lang().size > 0, tun: () => setLang(lang().size ? new Set<string>() : new Set(zeilen().filter((z) => !z.titel).map((z) => z.id))) }] : []),
    ...(lv() ? [{ titel: 'Drucken', zeichen: 'drucken', gruppe: 'Datei', rechts: true, tun: () => druckOeffnen('ava.lv', lv()!.id) }] : []),
    ...(vergeben() ? [{ titel: gesperrt() ? 'Gesperrt' : 'Freigeschaltet', zeichen: 'schluessel', gruppe: 'Vertrag', an: !gesperrt(), tun: freischalten }] : []),
  ]));
  // ---------- Tastatur ----------
  let flaeche!: HTMLDivElement;
  const taste = (e: KeyboardEvent) => {
    if (edit()) return;
    const l = sichtbar(), i = l.findIndex((z) => z.id === wahl.markiert()), m = l[i];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = l[Math.max(0, Math.min(l.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) { if (e.shiftKey) wahl.erweitern(n.id); else wahl.setMarkiert(n.id); } return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); wahl.alle(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); einfuegen(); return; }
    if (e.key === 'Escape') { wahl.setMarkiert(m?.id ?? null); return; }
    if (!m) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); kopieren(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x' && schreiben()) { e.preventDefault(); kopieren(true); return; }
    if (e.key === 'Delete') { e.preventDefault(); loeschen(); return; }
    if (e.key === 'Insert') { e.preventDefault(); neu(e.altKey); return; }
    if (e.key === 'F2' || e.key === 'Enter') { e.preventDefault(); bearbeiten(m.id, spalte()); return; }
    if (e.key === 'ArrowLeft' && m.titel && !zu().has(m.id)) { setZu(new Set([...zu(), m.id])); return; }
    if (e.key === 'ArrowRight' && m.titel && zu().has(m.id)) { const n = new Set(zu()); n.delete(m.id); setZu(n); return; }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); bearbeiten(m.id, spalte(), e.key); }
  };
  const editTaste = (e: KeyboardEvent, z: LvZeile) => {
    e.stopPropagation();   // sonst bearbeitet die Fläche dieselbe Taste gleich noch einmal (Enter öffnet das nächste Feld)
    if (e.key === 'Escape') { e.preventDefault(); setEdit(null); flaeche.focus(); return; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault(); const s = edit()!.spalte; if (!uebernehmen()) return;
      if (e.key === 'Enter') { const l = sichtbar(), n = l[l.findIndex((x) => x.id === z.id) + 1]; if (n) wahl.setMarkiert(n.id); flaeche.focus(); return; }
      const sp = spalten().map((x) => x.id as Sp).filter((x) => BEARBEITBAR.has(x)), k = sp[(sp.indexOf(s) + (e.shiftKey ? -1 : 1) + sp.length) % sp.length]!;
      bearbeiten(z.id, k);
    }
  };
  const menue = (e: MouseEvent, z: LvZeile) => {
    e.preventDefault(); if (!wahl.istGewaehlt(z.id)) wahl.setMarkiert(z.id);
    zeigeMenue(e, [
      ...(schreiben() ? (z.titel ? [{ titel: 'Position darin', tun: () => neu(false) }, { titel: 'Gliederungspunkt darin', tun: gliederung }]
        : [{ titel: 'Position darunter', tun: () => neu(false) }, { titel: 'Gliederungspunkt darunter', tun: () => neu(true) }]) : []),
      { titel: 'Kopieren', tun: () => kopieren() }, ...(schreiben() ? [{ titel: 'Einfügen darunter', tun: einfuegen }] : []),
      ...(!z.titel ? [{ titel: lang().has(z.id) ? 'Langtext zuklappen' : 'Langtext zeigen', tun: () => umschaltenLang(z.id) }] : []),
      ...(z.titel ? [{ titel: zu().has(z.id) ? 'Aufklappen' : 'Zuklappen', tun: () => umschalten(z.id) }] : []),
      ...(schreiben() && darf('lv_position', 'loeschen') ? [{ titel: wahl.gewaehlt().length > 1 ? `${wahl.gewaehlt().length} Zeilen löschen` : z.titel ? 'Titel mit Inhalt löschen' : 'Position löschen', gefahr: true, tun: loeschen }] : []),
    ].slice(0, 6));
  };
  const umschalten = (id: string) => { const n = new Set(zu()); if (n.has(id)) n.delete(id); else n.add(id); setZu(n); };
  const umschaltenLang = (id: string) => { const n = new Set(lang()); if (n.has(id)) n.delete(id); else n.add(id); setLang(n); };
  const spaltenPassend = () => {
    const sp = spalten(), zellen: Parameters<typeof zusatzMessen>[0] = [], sb = sichtbar(), zelle = flaeche.querySelector('.lvt-zeile .lvt-zelle') ?? flaeche;
    flaeche.querySelectorAll('.lvt-zeilen .lvt-zeile').forEach((r, k) => r.querySelectorAll(':scope > .lvt-zelle').forEach((el, i) => { const s = sp[i], z = sb[k]; if (s && z) zellen.push({ spalte: s.id, el, text: wert(z, s.id as Sp) }); }));
    spw.allePassend((n) => zeilen().map((z) => wert(z, n as Sp)), getComputedStyle(zelle).font, `600 13px ${getComputedStyle(flaeche).fontFamily}`, zusatzMessen(zellen, getComputedStyle(zelle).font));
  };
  return (
    <div class="lvt" ref={flaeche} tabIndex={0} onKeyDown={taste} role="treegrid" aria-label="Leistungsverzeichnis">
      <Show when={neuFenster() && projektId()}><NeuesLv projekt={projektId()!} onZu={() => setNeuFenster(false)} onFertig={(id, weg) => { lvWaehlen(p, id); if (weg === 'modell') setModellFenster(true); }} /></Show>
      <Show when={lv()} fallback={<p class="still-text">Noch kein Leistungsverzeichnis – oben unter Neu „LV“ anlegen.</p>}>
        <div class="lvt-kopf-lv"><h2>{[lv()!.werte.nummer, lv()!.werte.name].filter(Boolean).join(' · ')}</h2>
          <Show when={vergeben()}><button type="button" class="knopf klein still" onClick={freischalten} title={gesperrt() ? 'Beauftragt – Positionen sind Vertragsinhalt. Klick schaltet das Bearbeiten frei.' : 'Bearbeiten freigeschaltet – Klick sperrt wieder'}>{gesperrt() ? '🔒 gesperrt' : '🔓 freigeschaltet'}</button></Show>
          <span class="lvt-summe">Summe netto geschätzt <b>{eur(summe())} €</b></span></div>
        <Show when={vorbem()}>
          <div class="lvt-vorbem"><label for="lvt-vorbem">Vorbemerkungen</label>
            <textarea id="lvt-vorbem" rows={6} value={String(lv()!.werte.vorbemerkungen ?? '')} readOnly={!darf('lv', 'schreiben') || gesperrt()} placeholder="Vorbemerkungen zum LV – gelten für alle Positionen (Baustelle, Ausführung, Abrechnung …)"
              onChange={(e) => ausfuehren({ objekt: 'lv', art: 'aendern', objektId: lv()!.id, werte: { vorbemerkungen: e.currentTarget.value } }, 'Vorbemerkungen')} /></div>
        </Show>
        <LvQuellenLeiste lv={lv()!} />
        <Show when={modellFenster()}><ModellInsLv lv={lv()!} onZu={() => setModellFenster(false)} /></Show>
        <Show when={numFenster()}><NummerierenFenster maske={maske()} beispiel={zeilen()} onZu={() => setNumFenster(false)} onFertig={(m) => { setNumFenster(false); neuNummerieren(m); }} /></Show>
        <ErgaenzungFenster />
        <div class="lvt-tabelle">
          <div class="lvt-zeile lvt-kopf" role="row">
            <For each={spalten()}>{(s) => <div class="lvt-zelle" classList={{ rechts: !!s.rechts }} style={{ width: `${s.breite}px` }} role="columnheader" {...spw.ziehbar(s.id)}>{s.titel}
              <i class="griff" aria-hidden="true" title="Ziehen: Breite ändern · Doppelklick: alle Spalten passend zum Inhalt" onPointerDown={(e) => spw.breiteZiehen(e, s.id)} onDblClick={(e) => { e.stopPropagation(); spaltenPassend(); }} /></div>}</For>
          </div>
          <div class="lvt-zeilen">
            <Show when={zug()}>{(g) => <div class="lvt-ziel" style={{ top: `${g().y - 1}px` }} />}</Show>
            <For each={sichtbar().map((x) => x.id)} fallback={<p class="still-text lvt-leer">Noch keine Positionen. Mit „Titel“ und „Position“ oben anfangen oder eine GAEB-Datei einlesen.</p>}>{(id) => { const z = () => nachZeile().get(id)!; return (<>
              <div class="lvt-zeile" data-id={id} role="row" aria-level={z().ebene + 1} aria-selected={wahl.istGewaehlt(z().id)} classList={{ titel: z().titel, gewaehlt: wahl.istGewaehlt(z().id) || wahl.markiert() === z().id, 'lvt-hinweis': nachId(z().id)?.werte.art === 'hinweis' }}
                onClick={(e) => { if (!edit()) wahl.klick(e, z().id); }} onContextMenu={(e) => menue(e, z())}>
                <For each={spalten()}>{(s) => (
                  <div class="lvt-zelle" role="gridcell" classList={{ rechts: !!s.rechts, zeiger: wahl.markiert() === z().id && spalte() === s.id }} style={{ width: `${s.breite}px` }}
                    onClick={() => setSpalte(s.id as Sp)} onDblClick={() => bearbeiten(z().id, s.id as Sp)}>
                    <Show when={edit()?.id === z().id && edit()?.spalte === s.id} fallback={
                      s.id === 'oz' ? <span class="lvt-baum" style={{ 'padding-left': `${z().ebene * 16}px` }} title="Zum Verschieben hier greifen und ziehen" onPointerDown={(e) => zugStart(e, id)}>
                        <Show when={z().titel} fallback={<button type="button" class="lvt-lang-knopf" classList={{ an: lang().has(z().id) || !!nachId(z().id)?.werte.langtext }} title="Langtext" onClick={(e) => { e.stopPropagation(); umschaltenLang(z().id); }}>¶</button>}>
                          <Klappe zu={zu().has(z().id)} onKlick={() => umschalten(z().id)} /><Ordner offen={!zu().has(z().id)} /></Show>{z().oz}</span> : wert(z(), s.id as Sp)}>
                      <input class="lvt-edit" value={edit()!.text} ref={(el) => queueMicrotask(() => { el.focus(); if (edit()?.alles) el.select(); else el.setSelectionRange(el.value.length, el.value.length); })}
                        onInput={(e) => setEdit({ ...edit()!, text: e.currentTarget.value })} onKeyDown={(e) => editTaste(e, z())} onBlur={() => { const e = edit(); if (e && e.id === id && e.spalte === s.id) uebernehmen(); }} />
                    </Show>
                  </div>)}</For>
              </div>
              <Show when={!z().titel && lang().has(z().id)}>
                <div class="lvt-lang" style={{ 'padding-left': `${z().ebene * 16 + 40}px` }}>
                  <textarea rows={5} value={String(nachId(z().id)?.werte.langtext ?? '')} readOnly={!schreiben()} placeholder="Langtext – Leistungsbeschreibung, Material, Fabrikat, Ausführung, Abrechnung"
                    aria-label={`Langtext ${z().oz}`} onChange={(e) => aendern(z().id, { langtext: e.currentTarget.value }, 'Langtext')}
                    onContextMenu={(e) => { if (schreiben()) langtextMenue(e, e.currentTarget, (t) => aendern(z().id, { langtext: t }, 'Bietertextergänzung')); }} />
                </div>
              </Show>
            </>); }}</For>
          </div>
        </div>
      </Show>
    </div>
  );
}

/** Nummerieren: OZ-Maske wie in GAEB – Stellen je Titelebene, Stellen der Position, Schritt – mit Beispiel. */
function NummerierenFenster(p: { maske: OzMaske; beispiel: LvZeile[]; onZu: () => void; onFertig: (m: OzMaske) => void }) {
  const [titel, setTitel] = createSignal(p.maske.titel.join('.')), [pos, setPos] = createSignal(String(p.maske.position)), [schritt, setSchritt] = createSignal(String(p.maske.schritt));
  const m = () => maskeLesen(`${titel()}:${pos()}:${schritt()}`);
  const gueltig = () => maskeSchreiben(m()) === `${titel()}:${pos()}:${schritt()}`;
  const probe = () => { const n = nummerieren(p.beispiel, m()); return p.beispiel.slice(0, 4).map((z) => `${n.get(z.id) ?? z.oz}  ${z.titel ? 'Titel' : 'Position'}`); };
  return (
    <Dialog titel="Nummerieren" onAbbrechen={p.onZu} knoepfe={<><button class="knopf" onClick={p.onZu}>Abbrechen</button><button class="knopf haupt" disabled={!gueltig()} onClick={() => p.onFertig(m())}>Nummerieren</button></>}>
      <p class="still-text">Die Ordnungszahlen werden in der jetzigen Reihenfolge neu vergeben. Die Maske wird am LV gemerkt und gilt auch für neue Zeilen.</p>
      <label class="feld"><span>Stellen je Titelebene (z. B. 2.2 – zwei Ebenen mit je zwei Stellen)</span><input value={titel()} onInput={(e) => setTitel(e.currentTarget.value.trim())} /></label>
      <label class="feld"><span>Stellen der Position</span><input value={pos()} inputmode="numeric" onInput={(e) => setPos(e.currentTarget.value.trim())} /></label>
      <label class="feld"><span>Schritt zwischen Positionen</span><input value={schritt()} inputmode="numeric" onInput={(e) => setSchritt(e.currentTarget.value.trim())} /></label>
      <Show when={gueltig()} fallback={<p class="fehler-text">Titelebenen 1 bis 4 Stellen (höchstens 4 Ebenen), Position 1 bis 6 Stellen, Schritt ab 1.</p>}>
        <p class="still-text">So sieht es aus: {probe().join(' · ')}</p>
      </Show>
    </Dialog>
  );
}
