// Plausibilität der Fenster- & Türliste (wie im bisherigen Bauportal, neu gebaut): je Zeile Warnungen (⚠: vermutlich falsch,
// etwa fehlende Maße, doppelte Nummer, Absturzsicherung, 2. Rettungsweg, Brandschutztür ohne Türschließer) und Hinweise
// (ℹ: bitte ansehen, etwa fehlende Öffnungsrichtung). Reine Rechnung: im Browser, auf dem Server und in den Tests gleich.
import type { Werte } from '../../kern/modell';
import { TUER_WERTE } from './tueren';

export interface Befund { stufe: 'warnung' | 'hinweis'; text: string }

/** Maß in m – eingetragen in m oder mm (ab 10 gilt es als mm). */
const meter = (w: unknown): number | null => { const n = typeof w === 'number' ? w : Number(String(w ?? '').replace(',', '.')); return w === null || w === undefined || w === '' || !Number.isFinite(n) ? null : n >= 10 ? n / 1000 : n; };
const m2 = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Die Befunde einer Zeile; alle: die Zeilen der Liste (für doppelte Nummern). */
export function tuerPruefen(t: Werte, alle: Werte[]): Befund[] {
  const aus: Befund[] = [], w = (text: string) => aus.push({ stufe: 'warnung', text }), i = (text: string) => aus.push({ stufe: 'hinweis', text });
  const s = (n: string) => String(t[n] ?? '').trim();
  const art = s('art').toLowerCase(), text = `${s('art')} ${s('bem')}`.toLowerCase(), hat = new Set(s('ausstattung').split(',').filter(Boolean));
  const fenster = /fenster/.test(art) && !/fenstert(ü|ue)r/.test(art), tuer = !fenster && (/t(ü|ue)r|tor/.test(art) || (!art && meter(t.bruestung) === null));
  const b = meter(t.b), h = meter(t.h), br = meter(t.bruestung), rettung = /rettungsweg/.test(text) || /handkurbel/i.test(s('rollo'));
  if (!s('nr')) w('Nr. fehlt'); else if (alle.filter((x) => String(x.nr ?? '').trim() === s('nr')).length > 1) w(`Nr. ${s('nr')} kommt mehrfach vor`);
  if (!s('art')) i('Art fehlt (Fenster, Innentür …)');
  else if (/^[\d.,\s]+$/.test(s('art'))) w(`Art „${s('art')}“ ist eine Zahl – verrutschte Spalte?`);
  else if (!TUER_WERTE.art!.some((o) => o.wert === s('art'))) i(`Art „${s('art')}“ ist keine der üblichen Arten`);
  if (!s('raumname') && !s('raum')) i('Raum fehlt');
  if (b === null || h === null) w('Breite oder Höhe fehlt');
  if (tuer && b !== null && h !== null) {
    if (b < 0.55 || b > 3.2) w(`Breite ${m2(b)} m ist für eine Tür ungewöhnlich`);
    if (h < 1.98) w(`Höhe ${m2(h)} m – lichte Durchgangshöhe von 2,00 m ist so kaum möglich`);
    if (h > 3.5) w(`Höhe ${m2(h)} m ist für eine Tür ungewöhnlich`);
    if (hat.has('bf') && b < 1.01) w('barrierefrei: Rohbaubreite unter 1,01 m – lichte Breite 0,90 m (DIN 18040) wird kaum erreicht');
  }
  if (fenster && b !== null && h !== null && (b < 0.25 || b > 6 || h < 0.25 || h > 4)) w(`Maß ${m2(b)} × ${m2(h)} m ist für ein Fenster ungewöhnlich`);
  if (tuer && br !== null && br > 0.25) i(`Tür mit Brüstung ${m2(br)} m?`);
  if (fenster && br === null && !rettung) i('Brüstungshöhe fehlt');
  if (br !== null && br > 0 && br < 0.1 && !tuer) w(`Brüstung ${String(t.bruestung).replace('.', ',')} – Tippfehler?`);
  if (fenster && br !== null && br < 0.9 && !/^(eg|kg|ug)$/i.test(s('geschoss')) && !/absturz/.test(text)) w(`Brüstung ${m2(br)} m im ${s('geschoss') || 'Obergeschoss'} – Absturzsicherung prüfen`);
  if (rettung) {
    if (b !== null && h !== null && (b < 0.9 || h < 1.2)) w(`2. Rettungsweg: ${m2(b)} × ${m2(h)} m – lichte Öffnung mindestens 0,90 × 1,20 m`);
    else if (b !== null && h !== null) i('2. Rettungsweg: lichte Öffnung (nicht Rohbaumaß) mindestens 0,90 × 1,20 m prüfen');
    if (br !== null && br > 1.2) w(`2. Rettungsweg: Brüstung ${m2(br)} m – höchstens 1,20 m`);
    if (/^ja/i.test(s('rollo')) && !/kurbel|notöffn|notoeffn/i.test(`${s('rollo')} ${s('bem')}`)) w('2. Rettungsweg mit Rollladen: von innen ohne Strom zu öffnen (Handkurbel)?');
    if (/fest/.test(s('oeffnung'))) w('2. Rettungsweg, aber festverglast');
  }
  const fest = /^fest/.test(s('oeffnung'));
  if (!fest && (tuer || (fenster && s('oeffnung'))) && !s('din')) i('Öffnungsrichtung (DIN L/R) fehlt');
  if (fest && /din [lr]/i.test(s('din'))) i('festverglast, aber mit Öffnungsrichtung');
  if (s('brand') && tuer && !hat.has('otsch')) w(`${s('brand')}: Brand-/Rauchschutztür muss selbstschließend sein – Obentürschließer fehlt`);
  if (s('brand') && tuer && hat.has('licht') && !/brandschutz/i.test(s('glas'))) i(`${s('brand')} mit Lichtausschnitt – Brandschutzverglasung angeben`);
  if (tuer && /\bwc\b|dusch|bad\b|umkleide/i.test(s('raumname')) && !hat.has('lueft')) i('WC/Bad/Dusche: Lüftungsöffnung (Überströmung)?');
  if (tuer && /innent/.test(art) && ((s('rollo') && s('rollo') !== 'nein') || s('fb_innen') || s('fb_aussen'))) i('Innentür mit Rollladen/Fensterbank?');
  for (const [k, v] of Object.entries(t)) if (typeof v === 'string' && /^\?+$/.test(v.trim())) i(`${k}: noch offen („?“)`);
  return aus;
}
