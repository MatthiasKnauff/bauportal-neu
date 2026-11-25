// Visitenkarte (vCard 3.0) aus einem Kontakt und seinen weiteren Kontaktwegen – „Ins Handy“: das iPhone und Android öffnen sie
// als neuen Kontakt zum Speichern. Mehrere Kontakte ergeben eine Datei mit mehreren Karten. Reine Umwandlung, ohne Datenbank.
import type { Werte } from './modell';

const esc = (t: unknown) => String(t ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[;,]/g, (z) => `\\${z}`);
/** Zeilen über 75 Zeichen umbrechen (Folgezeile beginnt mit Leerzeichen), wie es vCard verlangt. */
const falten = (z: string) => { const aus: string[] = []; let r = z; while (r.length > 75) { aus.push(r.slice(0, 75)); r = ' ' + r.slice(75); } aus.push(r); return aus.join('\r\n'); };

export function vcard(k: Werte, wege: Werte[] = []): string {
  const firma = k.art !== 'bauherr' || k.ist_firma === true;   // Bauherr:in ohne Firma ist eine Person
  const person = String((firma ? k.ansprechpartner : k.name) ?? '').trim();
  const teile = person.split(/\s+/).filter(Boolean), nach = teile.length > 1 ? teile.pop()! : teile[0] ?? '', vor = teile.join(' ');
  const z: string[] = ['BEGIN:VCARD', 'VERSION:3.0'];
  z.push(`N:${esc(nach)};${esc(vor)};;${esc(k.titel)};${esc(k.zusatz)}`);
  z.push(`FN:${esc(person || k.name)}`);
  if (firma && k.name) z.push(`ORG:${esc(k.name)}`);
  if (k.funktion) z.push(`TITLE:${esc(k.funktion)}`);
  if (k.telefon) z.push(`TEL;TYPE=WORK,VOICE:${esc(k.telefon)}`);
  if (k.mobil) z.push(`TEL;TYPE=CELL:${esc(k.mobil)}`);
  if (k.email) z.push(`EMAIL;TYPE=INTERNET,WORK:${esc(k.email)}`);
  if (k.web) z.push(`URL:${esc(k.web)}`);
  if (k.strasse || k.ort) z.push(`ADR;TYPE=WORK:;;${esc(k.strasse)};${esc(k.ort)};;${esc(k.plz)};`);
  for (const w of wege) {
    if (w.art === 'telefon' && w.wert) z.push(`TEL;TYPE=VOICE:${esc(w.wert)}`);
    if (w.art === 'email' && w.wert) z.push(`EMAIL;TYPE=INTERNET:${esc(w.wert)}`);
    if (w.art === 'anschrift' && (w.strasse || w.ort)) z.push(`ADR:;;${esc(w.strasse)};${esc(w.ort)};;${esc(w.plz)};`);
    if (w.art === 'person') {
      const n = [w.anrede, w.titel, w.wert, w.zusatz].filter(Boolean).join(' ');
      if (w.telefon) z.push(`TEL;TYPE=VOICE:${esc(w.telefon)}`);
      if (w.email) z.push(`EMAIL;TYPE=INTERNET:${esc(w.email)}`);
      if (n) z.push(`NOTE:${esc(`Ansprechpartner:in: ${n}${w.bezeichnung ? ` (${String(w.bezeichnung)})` : ''}`)}`);
    }
  }
  const notiz = [k.notiz].filter(Boolean).join('\n');
  if (notiz) z.push(`NOTE:${esc(notiz)}`);
  z.push('END:VCARD');
  return z.map(falten).join('\r\n') + '\r\n';
}

/** Dateiname aus dem Namen des Kontakts. */
export const vcardName = (k: Werte) => `${String(k.name ?? 'Kontakt').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80)}.vcf`;
