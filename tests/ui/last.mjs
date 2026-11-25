// Last: 100 Benutzer gleichzeitig. Läuft nach klick.mjs gegen denselben Server (Benutzer „pipeline“, 2000 Kontakte).
// A – der Alltag: 100 Benutzer sind verbunden (Live-Abgleich), jeder ändert gleichzeitig etwas. Gemessen: wie lange das
//     Speichern dauert und bis wann jede Änderung bei allen 100 angekommen ist.
// B – der schlimmste Fall: alle 100 holen gleichzeitig ihren ganzen Stand (passiert nur beim ersten Start oder wenn sich
//     Rechte ändern; sonst hält der Browser seine Daten selbst).
const BASIS = process.env.BASIS ?? 'http://127.0.0.1:8000';
const N = Number(process.env.LAST_BENUTZER ?? 100);
const GRENZE_SCHREIBEN = Number(process.env.GRENZE_SCHREIBEN ?? 1500);   // ms, 95 % der Änderungen
const GRENZE_ANKOMMEN = Number(process.env.GRENZE_ANKOMMEN ?? 5000);     // ms, bis alle Änderungen bei allen sind
const GRENZE_STAND = Number(process.env.GRENZE_STAND ?? 15000);          // ms, 100 ganze Stände gleichzeitig
const json = { 'content-type': 'application/json' };
let fehler = false;
const pruefe = (ok, text) => { console.log(`${ok ? 'ok   ' : 'ZU LANGSAM '}${text}`); if (!ok) fehler = true; };

const anmelden = async () => {
  const r = await fetch(`${BASIS}/api/anmelden`, { method: 'POST', headers: json, body: JSON.stringify({ anmeldename: 'pipeline', kennwort: 'nur-fuer-die-pipeline' }) });
  if (!r.ok) throw new Error(`Anmelden: ${r.status} ${await r.text()}`);
  return r.headers.get('set-cookie').split(';')[0];
};
const p95 = (l) => { const s = [...l].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]); };
const kekse = [];
for (let i = 0; i < N; i++) kekse.push(await anmelden());
const start = await (await fetch(`${BASIS}/api/schnappschuss`, { headers: { cookie: kekse[0] } })).json();
const kontakte = (start.objekte?.kontakt ?? []).filter((z) => !z.geloescht);
if (kontakte.length < N) throw new Error(`zu wenige Kontakte für den Lasttest: ${kontakte.length}`);

// A: alle verbunden, alle ändern gleichzeitig
const abbruch = new AbortController();
const empfangen = kekse.map(() => ({ text: '' }));
await Promise.all(kekse.map(async (cookie, i) => {
  const r = await fetch(`${BASIS}/api/strom?seit=${start.stand}`, { headers: { cookie, accept: 'text/event-stream' }, signal: abbruch.signal });
  const leser = r.body.getReader(), dec = new TextDecoder();
  (async () => { try { for (;;) { const { value, done } = await leser.read(); if (done) break; empfangen[i].text += dec.decode(value, { stream: true }); } } catch { /* beendet */ } })();
}));
const ids = kekse.map(() => crypto.randomUUID());
const t0 = performance.now();
const schreiben = await Promise.all(kekse.map(async (cookie, i) => {
  const t = performance.now();
  const r = await fetch(`${BASIS}/api/befehle`, { method: 'POST', headers: { ...json, cookie }, body: JSON.stringify({ befehle: [
    { id: ids[i], objekt: 'kontakt', art: 'aendern', objektId: kontakte[i].id, gesehen: 0, werte: { ort: `Last ${i}` } }] }) });
  if (!r.ok) throw new Error(`Schreiben: ${r.status} ${await r.text()}`);
  await r.arrayBuffer();
  return performance.now() - t;
}));
let ankommen = 0;
for (;;) {
  if (empfangen.every((e) => ids.every((id) => e.text.includes(id)))) { ankommen = performance.now() - t0; break; }
  if (performance.now() - t0 > GRENZE_ANKOMMEN * 3) { ankommen = Infinity; break; }
  await new Promise((r) => setTimeout(r, 50));
}
abbruch.abort();
pruefe(p95(schreiben) <= GRENZE_SCHREIBEN, `A: ${N} Benutzer verbunden, alle ändern gleichzeitig – Speichern: 95 % unter ${p95(schreiben)} ms (Grenze ${GRENZE_SCHREIBEN})`);
pruefe(ankommen <= GRENZE_ANKOMMEN, `A: jede Änderung bei allen ${N} angekommen nach ${Math.round(ankommen)} ms (Grenze ${GRENZE_ANKOMMEN})`);

// B: alle holen gleichzeitig den ganzen Stand
const t1 = performance.now();
const staende = await Promise.all(kekse.map(async (cookie) => {
  const t = performance.now(); const r = await fetch(`${BASIS}/api/schnappschuss`, { headers: { cookie } }); if (!r.ok) throw new Error(`Stand: ${r.status}`); await r.arrayBuffer(); return performance.now() - t;
}));
const gesamt = performance.now() - t1;
pruefe(gesamt <= GRENZE_STAND, `B: ${N} ganze Stände (je ${kontakte.length} Kontakte) gleichzeitig in ${Math.round(gesamt)} ms, 95 % unter ${p95(staende)} ms (Grenze ${GRENZE_STAND})`);
process.exit(fehler ? 1 : 0);
