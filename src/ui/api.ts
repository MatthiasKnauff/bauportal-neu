// Die eine Stelle, an der die Oberfläche mit dem Server spricht – und der Zustand des Programms für diesen Benutzer
// (wer bin ich, welche Module, was darf ich).
import { createSignal } from 'solid-js';
import type { Beipackzettel } from '../kern/modul';
import type { Rechtart } from '../kern/modell';
import type { Rechte, Rolle } from '../kern/rechte';

export interface Benutzer { id: string; name: string; anmeldename: string; rolle: string }
export interface Zustand {
  version: string; umgebung: string; kennung: string; eingerichtet: boolean;
  benutzer: Benutzer | null; module: Beipackzettel[]; rollen: Rolle[];
  rechte?: Rechte; projekte?: string[]; sichtKennung?: string;
}

/** Der Zustand des Programms für diesen Benutzer – eine Stelle für die ganze Oberfläche. */
export const [zustand, setZustand] = createSignal<Zustand | null>(null);
export const ich = () => zustand()!.benutzer!;
export const istAdmin = () => zustand()?.benutzer?.rolle === 'admin';
/** Für die Oberfläche: Knopf zeigen oder nicht. Entschieden wird in der Datenbank. */
export const darf = (objekt: string, art: Rechtart) => zustand()?.rechte?.[objekt]?.[art] === true;
export const ausdrucke = (objekt: string) => zustand()!.module.flatMap((m) => m.ausdrucke ?? []).filter((a) => a.objekt === objekt);
export const modell = (name: string) => zustand()!.module.flatMap((m) => m.objekte).find((m) => m.name === name)!;
export const MERKER = 'bp_zustand';
export function merkeZustand(z: Zustand): void {
  setZustand(z);
  if (z.benutzer) localStorage.setItem(MERKER, JSON.stringify(z)); else localStorage.removeItem(MERKER);
}

export class Serverfehler extends Error {
  constructor(text: string, public status: number, public felder?: Record<string, string>) { super(text); }
}
/** Kein Netz oder Server nicht erreichbar. */
export class Netzfehler extends Error {}

/** Zahl der Aufrufe, die schon länger als 1,5 Sekunden laufen – dann zeigt die Oberfläche einen Warte-Hinweis. */
export const [wartetLange, setWartetLange] = createSignal(0);

export async function ruf<T>(pfad: string, body?: unknown): Promise<T> {
  let lange = false;
  const uhr = setTimeout(() => { lange = true; setWartetLange((n) => n + 1); }, 1500);
  try { return await rufOhneUhr<T>(pfad, body); }
  finally { clearTimeout(uhr); if (lange) setWartetLange((n) => n - 1); }
}

async function rufOhneUhr<T>(pfad: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    // Dateien gehen als Ganzes, alles andere als JSON
    r = await fetch(pfad, body === undefined ? {} : body instanceof Blob ? { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body }
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Netzfehler('Keine Verbindung zum Server');
  }
  if (r.status >= 502 && r.status <= 504) throw new Netzfehler('Server nicht erreichbar');
  const daten = await r.json().catch(() => ({}));
  if (!r.ok) throw new Serverfehler(daten.fehler ?? `Fehler ${r.status}`, r.status, daten.felder);
  return daten as T;
}

/** Holt eine Datei vom Server (z. B. ein PDF) und legt sie über den Browser beim Benutzer ab. */
export async function ladeDatei(pfad: string, body: unknown): Promise<void> {
  let lange = false;
  const uhr = setTimeout(() => { lange = true; setWartetLange((n) => n + 1); }, 1500);
  try {
    let r: Response;
    try { r = await fetch(pfad, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
    catch { throw new Netzfehler('Keine Verbindung zum Server'); }
    if (!r.ok) throw new Serverfehler((await r.json().catch(() => ({}))).fehler ?? `Fehler ${r.status}`, r.status);
    const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? 'Datei');
    const verweis = document.createElement('a');
    verweis.href = URL.createObjectURL(await r.blob()); verweis.download = name;
    verweis.click();
    setTimeout(() => URL.revokeObjectURL(verweis.href), 60000);
  } finally { clearTimeout(uhr); if (lange) setWartetLange((n) => n - 1); }
}

export function neueKennung(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // ohne https bietet der Browser randomUUID nicht an
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
