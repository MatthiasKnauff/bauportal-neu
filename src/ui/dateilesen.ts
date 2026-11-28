// Eine Datei (PDF, Scan, Foto, Word) vom Server lesen lassen: Seitenbilder, Zeilen mit Stelle und der Vorschlag für Titel und
// Positionen (module/ava/lvlesen). Eigenes Modul, damit „LV aus einer Datei“ und das Angebot auf Papier es teilen, ohne einander einzubinden.
import type { Vorschlag } from '../module/ava/lvlesen';
import { base64 } from './baukasten/bilder';
import { ruf } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';

/** Was „LV aus einer Datei“ annimmt (GAEB und Excel haben ihr eigenes Einlesen). */
export const DOKUMENTE = '.pdf,.jpg,.jpeg,.png,.webp,.tif,.tiff,.docx,.txt';
export interface DateiZeile { seite: number; x0: number; y0: number; x1: number; y1: number; text: string }
export interface Gelesen { seiten: { bild: string | null }[]; ocr: boolean; zeilen: DateiZeile[]; vorschlag: Vorschlag[] }

/** Datei lesen lassen (Seitenbilder, Zeilen, Vorschlag) – null, wenn es nicht ging (der Hinweis steht dann schon da). */
export async function vorschlagAus(f: File): Promise<Gelesen | null> {
  try { return await ruf<Gelesen>('/api/datei/lv', { name: f.name, inhalt: await base64(f) }); }
  catch (e) { hinweis((e as Error).message, { art: 'fehler' }); return null; }
}

