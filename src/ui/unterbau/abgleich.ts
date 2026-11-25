// Abgleich: Die Daten liegen im Gerät (IndexedDB) und werden von dort angezeigt – jeder Klick wirkt sofort.
// Änderungen gehen als Befehle an den Server; ohne Netz warten sie in einer Schlange.
// Was andere ändern, kommt über den Live-Strom und wird in derselben Reihenfolge angewendet wie auf dem Server.
import { createSignal } from 'solid-js';
import { createStore, produce, reconcile } from 'solid-js/store';
import { anwenden, gegenbefehl, type Befehl, type Protokolliert, type Vorlage, type Zeile } from '../../kern/befehl';
import type { Feld, ObjektModell, Wert, Werte } from '../../kern/modell';
import { benennen } from '../../kern/druck';
import { Netzfehler, Serverfehler, merkeZustand, modell, neueKennung, ruf, type Benutzer, type Zustand } from './api';
import { hinweis } from './meldungen';

const anzeige = (f: Feld, w: Wert | undefined) => f.optionen?.find((o) => o.wert === w)?.titel ?? String(w ?? '');

export type Lage = 'laden' | 'verbunden' | 'getrennt';

const [sicht, setSicht] = createStore<Record<string, Record<string, Zeile>>>({});
const [lage, setLage] = createSignal<Lage>('laden');
const [wartendAnzahl, setWartendAnzahl] = createSignal(0);
const [verlauf, setVerlauf] = createSignal({ zurueck: 0, vor: 0 });
const [abgelaufen, setAbgelaufen] = createSignal(false);
export { sicht, lage, wartendAnzahl, verlauf, abgelaufen };

// Zähler je Objektart: steigt bei jeder Änderung. Listen mit tausenden Einträgen hängen sich an diesen einen Zähler
// statt an jedes Feld jeder Zeile – so bleibt Suchen und Sortieren schnell. Einzelne Zellen und Karten lesen weiter fein aus „sicht“.
const zaehler = new Map<string, ReturnType<typeof createSignal<number>>>();
const zaehlerFuer = (objekt: string) => { let z = zaehler.get(objekt); if (!z) zaehler.set(objekt, (z = createSignal(0))); return z; };
export const geaendert = (objekt: string): number => zaehlerFuer(objekt)[0]();
const melde = (objekt: string) => zaehlerFuer(objekt)[1]((n) => n + 1);

interface Schritt { gegen: Vorlage[]; wieder: Vorlage[]; titel: string }

let idb: IDBDatabase | null = null;
let ich: Benutzer;
let sichtKennung = '';
let modelle = new Map<string, ObjektModell>();
const bestaetigt = new Map<string, Map<string, Zeile>>();   // Stand des Servers
let wartend: Befehl[] = [];                                  // eigene Befehle, die der Server noch nicht bestätigt hat
const gesendet = new Set<string>();
let stand = 0;
let strom: EventSource | null = null;
let sendet = false;
const zurueck: Schritt[] = [];
const vor: Schritt[] = [];

// ---------- Speicher im Gerät ----------
const wart = <T>(r: IDBRequest<T>) => new Promise<T>((ok, nein) => { r.onsuccess = () => ok(r.result); r.onerror = () => nein(r.error); });
function oeffneIdb(): Promise<IDBDatabase | null> {
  return new Promise((ok) => {
    try {
      const r = indexedDB.open('bauportal', 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('zeilen', { keyPath: ['objekt', 'id'] });
        r.result.createObjectStore('meta');
        r.result.createObjectStore('wartend', { keyPath: 'nr', autoIncrement: true });
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ok(null);
    } catch { ok(null); }   // z. B. privates Fenster: dann läuft alles nur im Arbeitsspeicher
  });
}
function schreibe(tun: (t: IDBTransaction) => void): void {
  if (!idb) return;
  try { tun(idb.transaction(['zeilen', 'meta', 'wartend'], 'readwrite')); } catch (e) { console.error(e); }
}
const karte = (objekt: string) => {
  let k = bestaetigt.get(objekt);
  if (!k) bestaetigt.set(objekt, (k = new Map()));
  return k;
};

// ---------- Sicht = Stand des Servers + eigene wartende Befehle ----------
// Die Sicht bekommt eigene Kopien: Was die Oberfläche vorläufig zeigt, darf den bestätigten Stand nie verändern.
const kopie = (z: Zeile): Zeile => ({ id: z.id, geloescht: z.geloescht, werte: { ...z.werte }, ...(z.herkunft ? { herkunft: { ...z.herkunft } } : {}) });
function neuRechnen(objekt: string, id: string): void {
  let z = karte(objekt).get(id);
  for (const w of wartend) if (w.objekt === objekt && w.objektId === id) z = anwenden(z, w);
  if (z && sicht[objekt]?.[id]) setSicht(objekt, id, reconcile(z));
  else setSicht(objekt, produce((o) => { if (z) o[id] = kopie(z); else delete o[id]; }));
  melde(objekt);
}
function allesRechnen(): void {
  const neu: Record<string, Record<string, Zeile>> = {};
  for (const name of modelle.keys()) {
    const o: Record<string, Zeile> = {};
    for (const z of karte(name).values()) o[z.id] = kopie(z);
    neu[name] = o;
  }
  setSicht(reconcile(neu));
  for (const name of modelle.keys()) melde(name);
  for (const w of wartend) neuRechnen(w.objekt, w.objektId);
}

// ---------- Start ----------
export async function starte(z: Zustand): Promise<void> {
  ich = z.benutzer!;
  modelle = new Map(z.module.flatMap((m) => m.objekte).map((m) => [m.name, m]));
  idb = await oeffneIdb();
  if (idb) {
    const t = idb.transaction(['zeilen', 'meta', 'wartend'], 'readonly');
    const [kennung, benutzer, st, sk, zeilen, schlange] = await Promise.all([
      wart(t.objectStore('meta').get('kennung')), wart(t.objectStore('meta').get('benutzer')), wart(t.objectStore('meta').get('stand')), wart(t.objectStore('meta').get('sicht')),
      wart(t.objectStore('zeilen').getAll()), wart(t.objectStore('wartend').getAll()),
    ]);
    if (kennung === z.kennung && benutzer === ich.id) {
      // Sieht der Benutzer inzwischen anderes (Rolle, Rechte, Projekte), wird der Bestand neu geholt.
      stand = sk === z.sichtKennung ? (st ?? 0) : 0;
      if (stand) for (const e of zeilen as (Zeile & { objekt: string })[]) karte(e.objekt).set(e.id, { id: e.id, geloescht: e.geloescht, werte: e.werte, ...(e.herkunft ? { herkunft: e.herkunft } : {}) });
      wartend = (schlange as { befehl: Befehl }[]).map((e) => e.befehl);
    } else {
      // anderes Bauportal oder anderer Benutzer: nichts Altes zeigen
      schreibe((t2) => { t2.objectStore('zeilen').clear(); t2.objectStore('wartend').clear(); t2.objectStore('meta').clear();
        t2.objectStore('meta').put(z.kennung, 'kennung'); t2.objectStore('meta').put(ich.id, 'benutzer'); });
    }
  }
  sichtKennung = z.sichtKennung ?? '';
  allesRechnen();
  setWartendAnzahl(wartend.length);
  if (stand === 0) await ladeSchnappschuss();
  verbinde();
  window.addEventListener('online', () => verbinde());
}

/** Rechte, Rollen oder Mitgliedschaften haben sich geändert: nachsehen, ob dieser Benutzer jetzt anderes sieht. */
async function sichtPruefen(): Promise<void> {
  try {
    const z = await ruf<Zustand>('/api/zustand');
    if (!z.benutzer) { setAbgelaufen(true); return; }
    merkeZustand(z);
    if (z.sichtKennung === sichtKennung) return;
    sichtKennung = z.sichtKennung ?? '';
    await ladeSchnappschuss();
  } catch (e) { if (!(e instanceof Netzfehler)) console.error(e); }
}

async function ladeSchnappschuss(): Promise<void> {
  try {
    const s = await ruf<{ stand: number; objekte: Record<string, Zeile[]> }>('/api/schnappschuss');
    bestaetigt.clear();
    schreibe((t) => {
      t.objectStore('zeilen').clear();
      for (const [objekt, zeilen] of Object.entries(s.objekte)) for (const z of zeilen) {
        karte(objekt).set(z.id, z);
        t.objectStore('zeilen').put({ objekt, ...z });
      }
      t.objectStore('meta').put(s.stand, 'stand');
      t.objectStore('meta').put(sichtKennung, 'sicht');
    });
    if (!idb) for (const [objekt, zeilen] of Object.entries(s.objekte)) for (const z of zeilen) karte(objekt).set(z.id, z);
    stand = s.stand;
    allesRechnen();
  } catch (e) {
    if (e instanceof Serverfehler && e.status === 401) setAbgelaufen(true);
    else if (!(e instanceof Netzfehler)) throw e;
  }
}

// ---------- Live-Strom ----------
function verbinde(): void {
  if (strom && strom.readyState !== EventSource.CLOSED) return;
  strom?.close();
  const s = (strom = new EventSource(`/api/strom?seit=${stand}`));
  s.onmessage = (e) => vomServer(JSON.parse(e.data) as Protokolliert);
  s.addEventListener('aktuell', () => { setLage('verbunden'); void senden(); });
  s.addEventListener('rechte', () => void sichtPruefen());
  s.onerror = () => {
    setLage('getrennt');
    if (s.readyState === EventSource.CLOSED) {
      // endgültig geschlossen (z. B. Sitzung abgelaufen): prüfen und neu versuchen
      setTimeout(async () => {
        try {
          const z = await ruf<Zustand>('/api/zustand');
          if (!z.benutzer) setAbgelaufen(true); else { merkeZustand(z); verbinde(); }
        } catch { verbinde(); }
      }, 3000);
    }
  };
}

function vomServer(b: Protokolliert): void {
  if (b.seq <= stand) return;
  const k = karte(b.objekt);
  const z = anwenden(k.get(b.objektId), b);
  if (z) k.set(z.id, z);
  stand = b.seq;
  const i = wartend.findIndex((w) => w.id === b.id);
  if (i >= 0) { wartend.splice(i, 1); gesendet.delete(b.id); setWartendAnzahl(wartend.length); }
  schreibe((t) => {
    if (z) t.objectStore('zeilen').put({ objekt: b.objekt, ...z });
    t.objectStore('meta').put(stand, 'stand');
    if (i >= 0) loescheWartend(t, b.id);
  });
  neuRechnen(b.objekt, b.objektId);
  if (b.ueberschrieben) meldeGleichzeitig(b);
}

function loescheWartend(t: IDBTransaction, id: string): void {
  const c = t.objectStore('wartend').openCursor();
  c.onsuccess = () => { const cur = c.result; if (!cur) return; if (cur.value.befehl.id === id) cur.delete(); else cur.continue(); };
}

function meldeGleichzeitig(b: Protokolliert): void {
  const m = modelle.get(b.objekt);
  if (!m) return;
  const w = sicht[b.objekt]?.[b.objektId]?.werte; const name = (w && objektname(m, w)) || m.titel;
  for (const [k, u] of Object.entries(b.ueberschrieben!)) {
    const f = m.felder.find((x) => x.name === k);
    if (!f) continue;
    const alt = { objekt: b.objekt, art: 'aendern' as const, objektId: b.objektId, werte: { [k]: u.wert } };
    if (b.benutzerId === ich.id) {
      hinweis(`${name}: „${f.titel}“ hat ${u.von} gleichzeitig geändert (auf „${anzeige(f, u.wert)}“). Deine Eingabe gilt.`,
        { aktion: { titel: `Wert von ${u.von} nehmen`, tun: () => ausfuehren(alt, `${f.titel} ändern`) } });
    } else if (u.vonId === ich.id) {
      hinweis(`${name}: ${b.benutzerName} hat deine Eingabe bei „${f.titel}“ gleichzeitig überschrieben (jetzt „${anzeige(f, b.werte?.[k] ?? null)}“).`,
        { aktion: { titel: 'Meinen Wert zurückholen', tun: () => ausfuehren(alt, `${f.titel} ändern`) } });
    }
  }
}

// ---------- Eigene Änderungen ----------
/** Führt einen Befehl aus: wirkt sofort im Gerät, geht dann an den Server. */
export function ausfuehren(v: Vorlage, titel: string, ohneVerlauf = false): void {
  if (ohneVerlauf) { eigenAnwenden(v); return; }
  ausfuehrenMehrere([v], titel);
}
/** Mehrere Befehle als ein Schritt: Rückgängig nimmt sie zusammen zurück (z. B. Vorgang löschen und die Kette überbrücken). */
export function ausfuehrenMehrere(vs: Vorlage[], titel: string): void {
  if (!vs.length) return;
  const gegen: Vorlage[] = [];
  for (const v of vs) { gegen.unshift(gegenbefehl(sicht[v.objekt]?.[v.objektId], v)); eigenAnwenden(v); }
  zurueck.push({ gegen, wieder: vs, titel });
  if (zurueck.length > 200) zurueck.shift();
  vor.length = 0;
  setVerlauf({ zurueck: zurueck.length, vor: 0 });
}
function eigenAnwenden(v: Vorlage): void {
  const b: Befehl = { ...v, werte: v.werte && { ...v.werte }, id: neueKennung(), gesehen: stand };
  wartend.push(b);
  setWartendAnzahl(wartend.length);
  schreibe((t) => t.objectStore('wartend').add({ befehl: b }));
  neuRechnen(b.objekt, b.objektId);
  void senden();
}

export function rueckgaengig(): void {
  const s = zurueck.pop();
  if (!s) return;
  vor.push(s);
  setVerlauf({ zurueck: zurueck.length, vor: vor.length });
  for (const g of s.gegen) eigenAnwenden(g);
  hinweis(`Rückgängig: ${s.titel}`);
}
export function wiederholen(): void {
  const s = vor.pop();
  if (!s) return;
  zurueck.push(s);
  setVerlauf({ zurueck: zurueck.length, vor: vor.length });
  for (const w of s.wieder) eigenAnwenden(w);
  hinweis(`Wiederholt: ${s.titel}`);
}

async function senden(): Promise<void> {
  if (sendet) return;
  sendet = true;
  try {
    for (;;) {
      const paket = wartend.filter((w) => !gesendet.has(w.id)).slice(0, 200);
      if (!paket.length) break;
      const r = await ruf<{ ergebnis: { id: string; seq?: number; fehler?: string }[] }>('/api/befehle', { befehle: paket });
      if (strom?.readyState === EventSource.OPEN) setLage('verbunden');
      for (const e of r.ergebnis) {
        if (!e.fehler) { gesendet.add(e.id); continue; }
        // Der Server hat abgelehnt: die Änderung im Gerät zurücknehmen und Bescheid sagen.
        const i = wartend.findIndex((w) => w.id === e.id);
        if (i < 0) continue;
        const [w] = wartend.splice(i, 1);
        schreibe((t) => loescheWartend(t, e.id));
        neuRechnen(w!.objekt, w!.objektId);
        hinweis(`Nicht gespeichert: ${e.fehler}`, { art: 'fehler' });
      }
      setWartendAnzahl(wartend.length);
    }
  } catch (e) {
    if (e instanceof Serverfehler && e.status === 401) setAbgelaufen(true);
    else if (e instanceof Netzfehler) setLage('getrennt');   // der Live-Strom merkt einen Abriss manchmal erst später
    else { console.error(e); hinweis('Senden fehlgeschlagen – ich versuche es erneut.', { art: 'fehler' }); }
    setTimeout(() => void senden(), 5000);
  } finally {
    sendet = false;
  }
}

/** Beim Abmelden bleibt nichts im Gerät zurück. */
export async function geraetLeeren(): Promise<void> {
  strom?.close();
  idb?.close();
  await new Promise<void>((ok) => { const r = indexedDB.deleteDatabase('bauportal'); r.onsuccess = r.onerror = r.onblocked = () => ok(); });
}

/** Name eines Eintrags, wie er überall dasteht – Anzeigefeld, sonst Ersatzname (kern/druck benennen). */
export const objektname = (m: ObjektModell, w: Werte): string => benennen(m, w, verweisname);
export const verweisname = (ziel: string, id: string): string => { const z = sicht[ziel]?.[id]; return z ? objektname(modell(ziel), z.werte) : ''; };
