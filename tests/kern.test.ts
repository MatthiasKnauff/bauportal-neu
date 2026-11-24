import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { register } from '../src/module';
import { kontakt } from '../src/module/adressen/beipackzettel';
import { Eingabefehler, pruefeWerte } from '../src/kern/modell';
import { anwenden, gegenbefehl, type Befehl, type Zeile } from '../src/kern/befehl';
import { schemaAnlegen, verbinden, type Db } from '../src/server/db';
import { Ablehnung, befehlAusfuehren, befehleSeit, schnappschuss } from '../src/server/protokoll';
import { baueServer } from '../src/server/server';

const BASIS = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5433/postgres';

async function frischeDb(): Promise<{ db: Db; weg: () => Promise<void> }> {
  const name = 'bp_test_' + randomUUID().replace(/-/g, '');
  const admin = new pg.Client({ connectionString: BASIS });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();
  const url = new URL(BASIS); url.pathname = '/' + name;
  const db = verbinden(url.toString());
  await schemaAnlegen(db, register);
  await schemaAnlegen(db, register);   // zweiter Lauf darf nichts kaputt machen
  return { db, weg: async () => {
    await db.end();
    const a = new pg.Client({ connectionString: BASIS });
    await a.connect(); await a.query(`drop database ${name} with (force)`); await a.end();
  } };
}

const anna = { id: randomUUID(), name: 'Anna' };
const ben = { id: randomUUID(), name: 'Ben' };
const bef = (teil: Partial<Befehl>): Befehl => ({ id: randomUUID(), objekt: 'kontakt', art: 'aendern', objektId: randomUUID(), gesehen: 0, ...teil });

test('Modell: Prüfung der Eingaben', () => {
  const w = pruefeWerte(kontakt, { name: '  Dach   GmbH ', email: 'info@dach.de' }, true);
  assert.equal(w.name, 'Dach GmbH');
  assert.equal(w.art, 'firma');
  assert.equal(w.ort, '');
  assert.throws(() => pruefeWerte(kontakt, { name: '' }, true), Eingabefehler);
  assert.throws(() => pruefeWerte(kontakt, { email: 'keine-adresse' }, false), Eingabefehler);
  assert.throws(() => pruefeWerte(kontakt, { art: 'gibtsnicht' }, false), Eingabefehler);
  assert.throws(() => pruefeWerte(kontakt, { unbekannt: 'x' }, false), Eingabefehler);
  assert.deepEqual(pruefeWerte(kontakt, { ort: 'Essen' }, false), { ort: 'Essen' });
});

test('Befehle: anwenden und Gegenbefehl heben sich auf', () => {
  const id = randomUUID();
  let z: Zeile | undefined = anwenden(undefined, { art: 'anlegen', objektId: id, werte: { name: 'A', ort: 'Essen' } });
  const aend = { objekt: 'kontakt', art: 'aendern' as const, objektId: id, werte: { ort: 'Bochum' } };
  const gegen = gegenbefehl(z, aend);
  z = anwenden(z, aend);
  assert.equal(z!.werte.ort, 'Bochum');
  z = anwenden(z, gegen);
  assert.equal(z!.werte.ort, 'Essen');
  z = anwenden(z, { art: 'loeschen', objektId: id });
  assert.equal(z!.geloescht, true);
});

test('Protokoll: anlegen, ändern, löschen, doppelte Befehle, Ablehnung', async () => {
  const { db, weg } = await frischeDb();
  try {
    const id = randomUUID();
    const a = bef({ art: 'anlegen', objektId: id, werte: { name: 'Dach GmbH', ort: 'Essen' } });
    const p1 = await befehlAusfuehren(db, register, anna, a);
    assert.equal(p1.seq, 1);
    assert.equal((await befehlAusfuehren(db, register, anna, a)).seq, 1, 'gleicher Befehl wirkt nur einmal');
    await befehlAusfuehren(db, register, anna, bef({ objektId: id, werte: { telefon: '0201 1' }, gesehen: 1 }));
    await assert.rejects(befehlAusfuehren(db, register, anna, bef({ objektId: id, werte: { name: '' } })), Eingabefehler);
    await assert.rejects(befehlAusfuehren(db, register, anna, bef({ objektId: randomUUID(), werte: { ort: 'x' } })), Ablehnung);
    await assert.rejects(befehlAusfuehren(db, register, anna, bef({ art: 'anlegen', objektId: id, werte: { name: 'x' } })), Ablehnung);
    await assert.rejects(befehlAusfuehren(db, register, anna, { ...a, id: randomUUID(), objekt: 'gibtsnicht' }), Ablehnung);
    await befehlAusfuehren(db, register, anna, bef({ art: 'loeschen', objektId: id }));
    const s = await schnappschuss(db, register);
    assert.equal(s.stand, 3, 'abgelehnte Befehle stehen nicht im Protokoll');
    assert.deepEqual(s.objekte.kontakt!.map((k) => [k.werte.name, k.werte.telefon, k.geloescht]), [['Dach GmbH', '0201 1', true]]);

    // Wer das Protokoll von vorn abspielt, kommt beim selben Stand an wie die Datenbank.
    const zeilen = new Map<string, Zeile>();
    for (const b of await befehleSeit(db, 0)) { const z = anwenden(zeilen.get(b.objektId), b); if (z) zeilen.set(z.id, z); }
    assert.deepEqual([...zeilen.values()], s.objekte.kontakt);
  } finally { await weg(); }
});

test('Gleichzeitige Änderungen: verschiedene Felder fließen zusammen, gleiches Feld – der Letzte gewinnt mit Hinweis', async () => {
  const { db, weg } = await frischeDb();
  try {
    const id = randomUUID();
    await befehlAusfuehren(db, register, anna, bef({ art: 'anlegen', objektId: id, werte: { name: 'Dach GmbH', telefon: '1' } }));
    // Anna und Ben kennen beide Stand 1 und ändern gleichzeitig.
    const p2 = await befehlAusfuehren(db, register, anna, bef({ objektId: id, werte: { telefon: '2' }, gesehen: 1 }));
    const p3 = await befehlAusfuehren(db, register, ben, bef({ objektId: id, werte: { ort: 'Essen' }, gesehen: 1 }));
    assert.equal(p2.ueberschrieben, undefined);
    assert.equal(p3.ueberschrieben, undefined, 'anderes Feld: kein Konflikt');
    const p4 = await befehlAusfuehren(db, register, ben, bef({ objektId: id, werte: { telefon: '3' }, gesehen: 1 }));
    assert.deepEqual(p4.ueberschrieben, { telefon: { wert: '2', von: 'Anna', vonId: anna.id } });
    const p5 = await befehlAusfuehren(db, register, anna, bef({ objektId: id, werte: { telefon: '4' }, gesehen: 4 }));
    assert.equal(p5.ueberschrieben, undefined, 'wer den neuen Stand kannte, überschreibt nichts unbemerkt');
    const k = (await schnappschuss(db, register)).objekte.kontakt![0]!;
    assert.deepEqual([k.werte.telefon, k.werte.ort], ['4', 'Essen']);
  } finally { await weg(); }
});

test('Server: Einrichtung, Anmeldung, Befehle, Live-Strom', async () => {
  const { db, weg } = await frischeDb();
  const app = await baueServer({ db, register, version: 'v-test', umgebung: 'test' });
  try {
    const adresse = await app.listen({ host: '127.0.0.1', port: 0 });
    const ruf = async (pfad: string, o: { body?: unknown; cookie?: string } = {}) => {
      const r = await fetch(adresse + pfad, {
        method: o.body ? 'POST' : 'GET',
        headers: { ...(o.body ? { 'content-type': 'application/json' } : {}), ...(o.cookie ? { cookie: o.cookie } : {}) },
        body: o.body ? JSON.stringify(o.body) : undefined,
      });
      return { status: r.status, daten: await r.json() as any, cookie: r.headers.get('set-cookie')?.split(';')[0] };
    };
    assert.equal((await ruf('/api/zustand')).daten.eingerichtet, false);
    assert.equal((await ruf('/api/schnappschuss')).status, 401);
    assert.equal((await ruf('/api/einrichtung', { body: { name: 'M', anmeldename: 'mk', kennwort: 'kurz' } })).status, 400);
    const ein = await ruf('/api/einrichtung', { body: { name: 'Matthias', anmeldename: 'MK', kennwort: 'ein-langes-kennwort' } });
    assert.equal(ein.status, 200);
    assert.equal((await ruf('/api/einrichtung', { body: { name: 'Böse', anmeldename: 'x1', kennwort: 'ein-langes-kennwort' } })).status, 400, 'Einrichtung nur einmal');
    assert.equal((await ruf('/api/anmelden', { body: { anmeldename: 'mk', kennwort: 'falsch' } })).status, 401);
    const an = await ruf('/api/anmelden', { body: { anmeldename: 'mk', kennwort: 'ein-langes-kennwort' } });
    const cookie = an.cookie!;
    const z = (await ruf('/api/zustand', { cookie })).daten;
    assert.equal(z.benutzer.rolle, 'admin');
    assert.equal(z.module[0].id, 'adressen');

    const neu = await ruf('/api/benutzer', { cookie, body: { name: 'Kollegin', anmeldename: 'kollegin', kennwort: 'noch-ein-kennwort' } });
    assert.equal(neu.daten.benutzer.rolle, 'mitarbeiter');
    const k = await ruf('/api/anmelden', { body: { anmeldename: 'kollegin', kennwort: 'noch-ein-kennwort' } });
    assert.equal((await ruf('/api/benutzer', { cookie: k.cookie })).status, 403);

    // Live-Strom öffnen, dann Befehle senden: sie kommen in Reihenfolge an.
    const strom = await fetch(adresse + '/api/strom?seit=0', { headers: { cookie } });
    const leser = strom.body!.getReader();
    const id = randomUUID();
    const antwort = await ruf('/api/befehle', { cookie, body: { befehle: [
      bef({ art: 'anlegen', objektId: id, werte: { name: 'Dach GmbH' } }),
      bef({ objektId: id, werte: { email: 'kaputt' } }),
      bef({ objektId: id, werte: { ort: 'Essen' } }),
    ] } });
    assert.deepEqual(antwort.daten.ergebnis.map((e: any) => [e.seq, !!e.fehler]), [[1, false], [undefined, true], [2, false]]);
    let text = '';
    while (!/id: 2\n/.test(text)) text += new TextDecoder().decode((await leser.read()).value);
    await leser.cancel();
    assert.ok(text.indexOf('id: 1\n') < text.indexOf('id: 2\n'));
    assert.match(text, /event: aktuell/);

    const s = (await ruf('/api/schnappschuss', { cookie })).daten;
    assert.equal(s.stand, 2);
    assert.equal(s.objekte.kontakt[0].werte.ort, 'Essen');

    await ruf('/api/abmelden', { cookie, body: {} });
    assert.equal((await ruf('/api/schnappschuss', { cookie })).status, 401);
  } finally { await app.close(); await weg(); }
});
