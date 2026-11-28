// Erinnerung zur Frist (wie bisher „Erledigungsdatum mit E-Mail-Erinnerung“): Hat ein Eintrag (Mangel, Aufgabe, Weisung, Notiz) eine
// Frist und ist nicht erledigt, wartet im Postausgang eine Erinnerung an die Person, die die Frist gesetzt hat – fällig am Tag der
// Frist, verschickt gebündelt über die zentrale Versandstelle (Verwaltung → Mail & Versand). Reine Rechnung; der Server führt aus.
import type { Werte } from '../../kern/modell';
import { EINTRAGSARTEN, MIT_ERLEDIGT, MIT_FRIST } from './beipackzettel';

const tag = (iso: unknown) => { const s = String(iso ?? ''); return /^\d{4}-\d\d-\d\d/.test(s) ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : ''; };

/** Soll für diesen Eintrag eine Erinnerung warten – und mit welchem Text? null: keine (keine Frist, erledigt, niemand zu erinnern). */
export function erinnerungFuer(e: Werte, projekt: string, bericht: { nummer?: unknown; datum?: unknown }): { betreff: string; text: string; faellig: string } | null {
  const art = String(e.art ?? '');
  if (!MIT_FRIST.includes(art) || !e.frist || !e.erinnern || (MIT_ERLEDIGT.includes(art) && e.erledigt === true)) return null;
  const titel = EINTRAGSARTEN.find((x) => x.wert === art)?.titel ?? 'Eintrag';
  const erste = String(e.text ?? '').trim().split('\n')[0]!.slice(0, 160);
  return { faellig: String(e.frist), betreff: `Bautagebuch – fällig: ${titel}${erste ? ` „${erste.slice(0, 60)}“` : ''}`,
    text: `${projekt ? `${projekt} – ` : ''}${titel}: ${erste}\nFrist ${tag(e.frist)}${bericht.nummer ? ` · aus dem Bautagebuch Nr. ${String(bericht.nummer)}` : ''}${bericht.datum ? ` vom ${tag(bericht.datum)}` : ''}` };
}
