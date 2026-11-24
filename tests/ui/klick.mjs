// Geschwindigkeit als feste Grenze: Ein Klick in einer Liste mit 2000 Einträgen muss unter 50 ms wirken.
// Läuft in der Pipeline gegen das gebaute Programm (BASIS = Adresse des laufenden Servers, frische Datenbank).
import { chromium } from 'playwright';

const BASIS = process.env.BASIS ?? 'http://127.0.0.1:8000';
const GRENZE_KLICK = Number(process.env.GRENZE_KLICK ?? 50);
const GRENZE_SUCHE = Number(process.env.GRENZE_SUCHE ?? 100);
const KENNWORT = 'nur-fuer-die-pipeline';
const json = { 'content-type': 'application/json' };

// Einrichten und füllen über die Schnittstelle
const ein = await fetch(`${BASIS}/api/einrichtung`, { method: 'POST', headers: json, body: JSON.stringify({ name: 'Pipeline', anmeldename: 'pipeline', kennwort: KENNWORT, bueroname: 'Testbüro' }) });
if (!ein.ok) throw new Error(`Einrichtung fehlgeschlagen: ${ein.status} ${await ein.text()}`);
const cookie = ein.headers.get('set-cookie').split(';')[0];
const gewerke = ['Rohbau', 'Dachdecker', 'Elektro', 'Sanitär', 'Heizung', 'Maler', 'Estrich', 'Fliesen', 'Tischler', 'Gerüst'];
const orte = ['Essen', 'Bochum', 'Mülheim', 'Duisburg', 'Dortmund'];
for (let p = 0; p < 4; p++) {
  const befehle = Array.from({ length: 500 }, (_, i) => { const n = p * 500 + i; return { id: crypto.randomUUID(), objekt: 'kontakt', art: 'anlegen', objektId: crypto.randomUUID(), gesehen: 0,
    werte: { name: `${gewerke[n % 10]} Firma ${String(n).padStart(4, '0')} GmbH`, art: 'firma', gewerk: gewerke[n % 10], ort: orte[n % 5], telefon: `0201 ${100000 + n}` } }; });
  const r = await fetch(`${BASIS}/api/befehle`, { method: 'POST', headers: { ...json, cookie }, body: JSON.stringify({ befehle }) });
  if (!r.ok) throw new Error(`Füllen fehlgeschlagen: ${r.status}`);
}

const browser = await chromium.launch();
const seite = await (await browser.newContext({ viewport: { width: 1400, height: 880 } })).newPage();
const fehler = [];
seite.on('pageerror', (e) => fehler.push(e.message));
await seite.goto(BASIS);
await seite.getByLabel('Anmeldename').fill('pipeline');
await seite.getByLabel('Kennwort').fill(KENNWORT);
await seite.getByRole('button', { name: 'Anmelden' }).click();
await seite.locator('.kachel', { hasText: 'Adressen' }).first().click();   // von der Startseite ins Modul
await seite.getByText('2000 Kontakte').waitFor();

// Zeit im Browser messen: vom Klick bis die Karte den Namen der Zeile zeigt und das Bild steht
const klicks = [];
for (let i = 2; i < 14; i++) {
  klicks.push(await seite.evaluate(async (i) => {
    const z = document.querySelectorAll('tbody tr:not([aria-hidden])')[i];
    const t0 = performance.now();
    z.click();
    await new Promise((ok) => { const p = () => (document.querySelector('.karte h2')?.textContent === z.firstChild.textContent ? ok() : requestAnimationFrame(p)); p(); });
    await new Promise((r) => requestAnimationFrame(() => r()));
    return performance.now() - t0;
  }, i));
}
const suchen = [];
for (const wort of ['dach bochum', 'elektro essen', 'maler', 'firma 00']) {
  suchen.push(await seite.evaluate(async (wort) => {
    const s = document.querySelector('.suche');
    const t0 = performance.now();
    s.value = wort; s.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    return performance.now() - t0;
  }, wort));
}
await browser.close();

const mitte = (l) => [...l].sort((a, b) => a - b)[Math.floor(l.length / 2)];
const klick = mitte(klicks), suche = mitte(suchen);
console.log(`Klick auf eine Zeile (2000 Einträge): ${klick.toFixed(0)} ms im Mittel – Grenze ${GRENZE_KLICK} ms  [${klicks.map((k) => k.toFixed(0)).join(' ')}]`);
console.log(`Suche tippen: ${suche.toFixed(0)} ms im Mittel – Grenze ${GRENZE_SUCHE} ms  [${suchen.map((k) => k.toFixed(0)).join(' ')}]`);
if (fehler.length) { console.error('JavaScript-Fehler:\n' + fehler.join('\n')); process.exit(1); }
if (klick > GRENZE_KLICK || suche > GRENZE_SUCHE) { console.error('Zu langsam.'); process.exit(1); }
