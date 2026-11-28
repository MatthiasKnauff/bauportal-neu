// Was ist neu (wie im bisherigen Bauportal, Wunsch 28.11.2026: „bei jedem Push sofort“): je Push ein paar Einträge – was dazukam,
// wo man es findet (App und Ansicht, „Zeigen ›“) und worauf man schauen soll. Jede:r sieht Neues einmal (gemerkt am eigenen Konto,
// also auf allen Geräten); wer zum ersten Mal kommt, bekommt nur, was höchstens 14 Tage alt ist.
// Wird mit jedem Push nachgeführt – neueste zuerst. stand: Kurzkennung des Commits (leer, solange er noch nicht gepusht ist).

export interface Neuigkeit {
  id: string;          // eindeutig, bleibt (z. B. „2026-11-28-bt-fotos“)
  zeit: string;        // JJJJ-MM-TTTHH:MM – wann es auf den Testserver kam
  stand?: string;      // Commit, mit dem es kam
  app?: string;        // Modul (leer: gilt überall)
  ansicht?: string;    // Ansicht im Modul, zu der „Zeigen ›“ springt
  titel: string;
  text: string;        // was es ist und worauf man schauen soll
}

export const NEUIGKEITEN: Neuigkeit[] = [
  { id: '2026-11-28-neu', zeit: '2026-11-28T14:19', app: '', titel: 'Was ist neu – bei jedem Push',
    text: 'Wie im bisherigen Bauportal: Was dazukam, steht hier – je Stand, mit „Zeigen ›“ zur Stelle. Neues für dich ist markiert und kommt nach dem Anmelden einmal von selbst; jederzeit über „?“ oder das Benutzermenü.' },
  { id: '2026-11-28-rechte', zeit: '2026-11-28T14:19', app: 'verwaltung', ansicht: 'rechte', titel: 'Rollen & Rechte wie besprochen',
    text: 'Rollen selbst anlegen (als Kopie), umbenennen, löschen, solange niemand sie hat · je Rolle und App „an · nur lesen · aus“, aufklappbar je Art · „Wer darf was?“ mit Ausnahmen je Person (＋/−) · „Verwaltung“: je Bereich – · sehen · ändern, Zugänge „neu setzen“. Oben auf jeder Seite der Verwaltung: „Wer darf hier hinein?“. Bitte ansehen: die drei Ansichten und eine Probe-Rolle.' },
  { id: '2026-11-28-bt-durch', zeit: '2026-11-28T12:30', stand: '2245440', app: 'bautagebuch', ansicht: 'berichte', titel: 'Bautagebuch durch – bitte ansehen',
    text: 'Bildvergleich mit dem alten Bautagebuch abgeschlossen. Am Handy wählst du den Bericht wieder oben (Nr. · Datum ▾). Leeres Wetter druckt nichts mehr („keine Angabe“).' },
  { id: '2026-11-28-bt-druck', zeit: '2026-11-28T11:26', stand: '197b757', app: 'bautagebuch', ansicht: 'berichte', titel: 'Drucken mit oder ohne Fotos, per Mail senden',
    text: 'In der Druckvorschau: Schalter „mit Fotos“ (nur für diesen Ausdruck) und „Per Mail senden …“ an Beteiligte des Projekts; dazu Teilen → Senden in der Menüleiste. Eingaben in den Listen mit × oder Esc verwerfen – Rückgängig bringt Text und Fotos zurück. Ein Bericht ohne Wetter bekommt es automatisch (Projektadresse, Datum).' },
  { id: '2026-11-28-postfach', zeit: '2026-11-28T10:29', stand: 'ab58f60', app: 'verwaltung', ansicht: 'mail', titel: 'Postfächer: Büro und eigene Adresse',
    text: 'Projektmails gehen über die Büroadresse, wahlweise „von mir“. Je Adresse SMTP/IMAP oder Microsoft 365 (Anmeldung mit Microsoft, kein gespeichertes Kennwort). Das eigene Postfach richtest du unter Mein Konto ein. „Kopie an mich“ geht an die eigene Adresse, sonst ans Büro.' },
  { id: '2026-11-28-ablage', zeit: '2026-11-28T09:52', stand: '900ffca', app: 'dateien', ansicht: 'dateien', titel: 'Ablegen: Ordnerbaum des Projektordners',
    text: 'Im Ablegen-Dialog steht unten immer der Baum des Projektordners, der vorgeschlagene Ordner ist gewählt und aufgeklappt. In den Adressen wählst du die Projekte eines Kontakts aus der Projektliste.' },
  { id: '2026-11-28-bt-bauleitung', zeit: '2026-11-28T09:45', stand: '9847f5f', app: 'bautagebuch', ansicht: 'berichte', titel: 'Bauleitung vor Ort, Schritte wählen, Foto zuordnen',
    text: 'Mehrere Personen in „Bauleitung vor Ort“ · bei „Schritt für Schritt“ ⚙ Schritte wählen (je Person gemerkt) · am Handy ＋ Foto aufnehmen und zuordnen · im Kalender mit Umschalt+Klick einen Zeitraum markieren und drucken · Erinnerung zur Frist per Mail.' },
];

/** Was für diese Person neu ist: nach dem, was sie zuletzt gesehen hat; beim ersten Mal nur die letzten 14 Tage. */
export function neuFuer(liste: Neuigkeit[], gesehen: string, jetzt = new Date()): Neuigkeit[] {
  const grenze = gesehen || new Date(jetzt.getTime() - 14 * 86400000).toISOString().slice(0, 16);
  return liste.filter((n) => n.zeit > grenze);
}
export const neuesteZeit = (liste: Neuigkeit[]) => liste.reduce((m, n) => (n.zeit > m ? n.zeit : m), '');
