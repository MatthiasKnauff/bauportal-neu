import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { register } from '../src/module';
import { kontakt } from '../src/module/adressen/beipackzettel';
import { Eingabefehler, pruefeWerte } from '../src/kern/modell';
import { anwenden, gegenbefehl, type Befehl, type Zeile } from '../src/kern/befehl';
import { SYSTEM, schemaAnlegen, verbinden, type Absender, type Db } from '../src/server/db';
import { Ablehnung, befehlAusfuehren, befehleSeit, schnappschuss } from '../src/server/protokoll';
import { festeKennung, grundausstattung } from '../src/server/grundausstattung';
import { kennwortSetzen } from '../src/server/anmeldung';
import { baueServer } from '../src/server/server';

const BASIS = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5433/postgres';

async function frischeDb(vorher?: (db: Db) => Promise<void>): Promise<{ db: Db; weg: () => Promise<void> }> {
  const name = 'bp_test_' + randomUUID().replace(/-/g, '');
  const admin = new pg.Client({ connectionString: BASIS });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();
  const url = new URL(BASIS); url.pathname = '/' + name;
  const db = verbinden(url.toString());
  if (vorher) await vorher(db);
  for (let i = 0; i < 2; i++) {   // zweiter Lauf darf nichts ändern
    await schemaAnlegen(db, register);
    await grundausstattung(db, register);
  }
  return { db, weg: async () => {
    await db.end();
    const a = new pg.Client({ connectionString: BASIS });
    await a.connect(); await a.query(`drop database ${name} with (force)`); await a.end();
  } };
}

const bef = (teil: Partial<Befehl>): Befehl => ({ id: randomUUID(), objekt: 'kontakt', art: 'aendern', objektId: randomUUID(), gesehen: 0, ...teil });
const tun = (db: Db, wer: Absender, teil: Partial<Befehl>) => befehlAusfuehren(db, register, wer, bef(teil));

async function leute(db: Db): Promise<Record<'admin' | 'leitung' | 'bau' | 'mit' | 'gast', Absender>> {
  const aus: Record<string, Absender> = {};
  for (const [kurz, rolle] of [['admin', 'admin'], ['leitung', 'bueroleitung'], ['bau', 'bauleitung'], ['mit', 'mitarbeiter'], ['gast', 'gast']] as const) {
    const id = randomUUID();
    await tun(db, SYSTEM, { objekt: 'benutzer', art: 'anlegen', objektId: id, werte: { name: kurz, anmeldename: kurz, rolle } });
    aus[kurz] = { id, name: kurz };
  }
  return aus as never;
}

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
    const { admin } = await leute(db);
    const id = randomUUID();
    const a = bef({ art: 'anlegen', objektId: id, werte: { name: 'Dach GmbH', ort: 'Essen' } });
    const p1 = await befehlAusfuehren(db, register, admin, a);
    assert.equal((await befehlAusfuehren(db, register, admin, a)).seq, p1.seq, 'gleicher Befehl wirkt nur einmal');
    await tun(db, admin, { objektId: id, werte: { telefon: '0201 1' }, gesehen: p1.seq });
    await assert.rejects(tun(db, admin, { objektId: id, werte: { name: '' } }), Eingabefehler);
    await assert.rejects(tun(db, admin, { objektId: randomUUID(), werte: { ort: 'x' } }), Ablehnung);
    await assert.rejects(tun(db, admin, { art: 'anlegen', objektId: id, werte: { name: 'x' } }), Ablehnung);
    await assert.rejects(befehlAusfuehren(db, register, admin, { ...a, id: randomUUID(), objekt: 'gibtsnicht' }), Ablehnung);
    const p3 = await tun(db, admin, { art: 'loeschen', objektId: id });
    const s = await schnappschuss(db, register, admin);
    assert.equal(s.stand, p3.seq);
    assert.equal(p3.seq, p1.seq + 2, 'abgelehnte Befehle stehen nicht im Protokoll');
    assert.deepEqual(s.objekte.kontakt!.map((k) => [k.werte.name, k.werte.telefon, k.geloescht]), [['Dach GmbH', '0201 1', true]]);

    // Wer das Protokoll von vorn abspielt, kommt beim selben Stand an wie die Datenbank – für jedes Objekt.
    const zeilen = new Map<string, Zeile>();
    for (const b of await befehleSeit(db, admin, 0)) { const z = anwenden(zeilen.get(b.objektId), b); if (z) zeilen.set(z.id, z); }
    const alle = Object.values(s.objekte).flat().sort((x, y) => x.id.localeCompare(y.id));
    assert.deepEqual([...zeilen.values()].sort((x, y) => x.id.localeCompare(y.id)), alle);
  } finally { await weg(); }
});

test('Gleichzeitige Änderungen: verschiedene Felder fließen zusammen, gleiches Feld – der Letzte gewinnt mit Hinweis', async () => {
  const { db, weg } = await frischeDb();
  try {
    const { leitung: anna, bau: ben } = await leute(db);
    const id = randomUUID();
    const p1 = await tun(db, anna, { art: 'anlegen', objektId: id, werte: { name: 'Dach GmbH', telefon: '1' } });
    const g = p1.seq;   // Anna und Ben kennen beide diesen Stand und ändern gleichzeitig.
    const p2 = await tun(db, anna, { objektId: id, werte: { telefon: '2' }, gesehen: g });
    const p3 = await tun(db, ben, { objektId: id, werte: { ort: 'Essen' }, gesehen: g });
    assert.equal(p2.ueberschrieben, undefined);
    assert.equal(p3.ueberschrieben, undefined, 'anderes Feld: kein Konflikt');
    const p4 = await tun(db, ben, { objektId: id, werte: { telefon: '3' }, gesehen: g });
    assert.deepEqual(p4.ueberschrieben, { telefon: { wert: '2', von: anna.name, vonId: anna.id } });
    const p5 = await tun(db, anna, { objektId: id, werte: { telefon: '4' }, gesehen: p4.seq });
    assert.equal(p5.ueberschrieben, undefined, 'wer den neuen Stand kannte, überschreibt nichts unbemerkt');
    const k = (await schnappschuss(db, register, anna)).objekte.kontakt![0]!;
    assert.deepEqual([k.werte.telefon, k.werte.ort], ['4', 'Essen']);
  } finally { await weg(); }
});

test('Rechte sitzen in der Datenbank: Rollen, Löschen, Benutzer und Rechte nur für Admins', async () => {
  const { db, weg } = await frischeDb();
  try {
    const { admin, leitung, mit, gast } = await leute(db);
    const id = randomUUID();
    await tun(db, mit, { art: 'anlegen', objektId: id, werte: { name: 'Dach GmbH' } });
    await tun(db, mit, { objektId: id, werte: { ort: 'Essen' } });
    await assert.rejects(tun(db, mit, { art: 'loeschen', objektId: id }), /Recht/, 'Mitarbeiter:in darf Kontakte nicht löschen');
    await assert.rejects(tun(db, gast, { art: 'anlegen', werte: { name: 'x' } }), /Recht/);
    await assert.rejects(tun(db, gast, { objektId: id, werte: { ort: 'x' } }), Ablehnung, 'für den Gast gibt es den Kontakt nicht');
    assert.deepEqual((await schnappschuss(db, register, gast)).objekte.kontakt, []);
    assert.deepEqual((await befehleSeit(db, gast, 0)).filter((b) => b.objekt === 'kontakt'), [], 'auch im Protokoll sieht der Gast nichts davon');
    await tun(db, leitung, { art: 'loeschen', objektId: id });

    // Benutzer und Rechte: nur Admin
    await assert.rejects(tun(db, leitung, { objekt: 'benutzer', objektId: mit.id, werte: { rolle: 'admin' } }), /Recht/);
    await assert.rejects(tun(db, mit, { objekt: 'benutzer', objektId: mit.id, werte: { rolle: 'admin' } }), /Recht/);
    const rechtId = festeKennung('recht:mitarbeiter:kontakt');
    await assert.rejects(tun(db, leitung, { objekt: 'recht', objektId: rechtId, werte: { loeschen: true } }), /Recht/);
    // Admin ändert das Recht – es gilt sofort, ohne Programmänderung
    await tun(db, leitung, { art: 'wiederherstellen', objektId: id });
    await tun(db, admin, { objekt: 'recht', objektId: rechtId, werte: { loeschen: true } });
    await tun(db, mit, { art: 'loeschen', objektId: id });

    // Eindeutiger Anmeldename, letzter Admin bleibt, Gesperrte dürfen nichts
    await assert.rejects(tun(db, admin, { objekt: 'benutzer', art: 'anlegen', werte: { name: 'Doppelt', anmeldename: 'MIT', rolle: 'gast' } }), Eingabefehler);
    await assert.rejects(tun(db, admin, { objekt: 'benutzer', objektId: admin.id, werte: { rolle: 'mitarbeiter' } }), /Administrator/);
    await assert.rejects(tun(db, admin, { objekt: 'benutzer', objektId: admin.id, werte: { gesperrt: true } }), /Administrator/);
    await tun(db, admin, { objekt: 'benutzer', objektId: mit.id, werte: { gesperrt: true } });
    await assert.rejects(tun(db, mit, { art: 'anlegen', werte: { name: 'x' } }), /Recht/);
  } finally { await weg(); }
});

test('Projekte: sichtbar nur für Mitglieder und für Rollen, die alle Projekte sehen', async () => {
  const { db, weg } = await frischeDb();
  try {
    const { leitung, bau, mit } = await leute(db);
    const p = randomUUID();
    await assert.rejects(tun(db, bau, { objekt: 'projekt', art: 'anlegen', objektId: p, werte: { name: 'Haus A' } }), /Recht/, 'anlegen nur mit Blick auf alle Projekte');
    await tun(db, leitung, { objekt: 'projekt', art: 'anlegen', objektId: p, werte: { name: 'Haus A' } });
    const sieht = async (wer: Absender) => (await schnappschuss(db, register, wer)).objekte.projekt!.map((x) => x.werte.name);
    assert.deepEqual(await sieht(bau), []);
    await assert.rejects(tun(db, bau, { objekt: 'projekt', objektId: p, werte: { ort: 'Essen' } }), Ablehnung);
    const m = randomUUID();
    await assert.rejects(tun(db, bau, { objekt: 'projekt_mitglied', art: 'anlegen', objektId: m, werte: { projekt: p, benutzer: bau.id } }), /Recht/, 'niemand macht sich selbst zum Mitglied');
    await tun(db, leitung, { objekt: 'projekt_mitglied', art: 'anlegen', objektId: m, werte: { projekt: p, benutzer: bau.id } });
    assert.deepEqual(await sieht(bau), ['Haus A']);
    assert.deepEqual(await sieht(mit), []);
    await tun(db, bau, { objekt: 'projekt', objektId: p, werte: { ort: 'Essen' } });   // Bauleitung darf ihr Projekt ändern
    assert.equal((await befehleSeit(db, mit, 0)).filter((b) => b.objekt.startsWith('projekt')).length, 0);
    assert.equal((await befehleSeit(db, bau, 0)).filter((b) => b.objekt.startsWith('projekt')).length, 3);
    await tun(db, leitung, { objekt: 'projekt_mitglied', art: 'loeschen', objektId: m });
    assert.deepEqual(await sieht(bau), []);
  } finally { await weg(); }
});

test('Übernahme: Benutzer aus dem ersten Stand werden zu Objekten und können sich weiter anmelden', async () => {
  const id = randomUUID();
  const { db, weg } = await frischeDb(async (d) => {
    await d.query(`create table kern_benutzer (id uuid primary key, name text not null, anmeldename text not null unique, kennwort text not null, rolle text not null default 'mitarbeiter', erstellt timestamptz not null default now())`);
    await d.query(`create table kern_kennwort (benutzer_id uuid primary key, kennwort text not null, geaendert timestamptz not null default now())`);
    await kennwortSetzen(d, id, 'ein-langes-kennwort');
    const h = (await d.query('select kennwort from kern_kennwort')).rows[0].kennwort;
    await d.query('drop table kern_kennwort');
    await d.query('insert into kern_benutzer (id, name, anmeldename, kennwort, rolle) values ($1,$2,$3,$4,$5)', [id, 'Matthias', 'mk', h, 'admin']);
  });
  const app = await baueServer({ db, register, version: 'v-test', umgebung: 'test' });
  try {
    const r = await app.inject({ method: 'POST', url: '/api/anmelden', payload: { anmeldename: 'mk', kennwort: 'ein-langes-kennwort' } });
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().benutzer.rolle, 'admin');
    assert.equal((await db.query("select to_regclass('kern_benutzer') as t")).rows[0].t, null);
  } finally { await app.close(); await weg(); }
});

test('Server: Einrichtungsassistent, Anmeldung, Kennwort, Befehle, gefilterter Live-Strom', async () => {
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
    assert.equal((await ruf('/api/zustand')).daten.eingerichtet, false, 'fehlgeschlagene Einrichtung hinterlässt nichts');
    const ein = await ruf('/api/einrichtung', { body: { name: 'Matthias', anmeldename: 'MK', kennwort: 'ein-langes-kennwort', bueroname: 'GK3', bundesland: 'Nordrhein-Westfalen', musterprojekt: true } });
    assert.equal(ein.status, 200);
    assert.equal((await ruf('/api/einrichtung', { body: { name: 'Böse', anmeldename: 'x1', kennwort: 'ein-langes-kennwort' } })).status, 400, 'Einrichtung nur einmal');
    assert.equal((await ruf('/api/anmelden', { body: { anmeldename: 'mk', kennwort: 'falsch' } })).status, 401);
    const cookie = (await ruf('/api/anmelden', { body: { anmeldename: 'mk', kennwort: 'ein-langes-kennwort' } })).cookie!;
    const z = (await ruf('/api/zustand', { cookie })).daten;
    assert.equal(z.benutzer.rolle, 'admin');
    assert.deepEqual(z.module.map((m: any) => m.id), ['adressen', 'projekte', 'verwaltung']);
    assert.equal(z.rechte.kontakt.loeschen, true);
    const s0 = (await ruf('/api/schnappschuss', { cookie })).daten;
    assert.equal(s0.objekte.buero[0].werte.name, 'GK3');
    assert.equal(s0.objekte.projekt[0].werte.name, 'Musterprojekt Wohnhaus');
    assert.equal(s0.objekte.kontakt.length, 3);

    // Kollegin anlegen (Befehl) und Kennwort setzen
    const kid = randomUUID();
    const neu = await ruf('/api/befehle', { cookie, body: { befehle: [bef({ objekt: 'benutzer', art: 'anlegen', objektId: kid, werte: { name: 'Kollegin', anmeldename: 'kollegin', rolle: 'mitarbeiter' } })] } });
    assert.ok(neu.daten.ergebnis[0].seq);
    assert.equal((await ruf('/api/anmelden', { body: { anmeldename: 'kollegin', kennwort: 'noch-ein-kennwort' } })).status, 401, 'ohne Kennwort keine Anmeldung');
    assert.equal((await ruf('/api/kennwort', { cookie, body: { benutzerId: kid, kennwort: 'noch-ein-kennwort' } })).status, 200);
    const k = (await ruf('/api/anmelden', { body: { anmeldename: 'kollegin', kennwort: 'noch-ein-kennwort' } })).cookie!;
    assert.equal((await ruf('/api/kennwort', { cookie: k, body: { benutzerId: z.benutzer.id, kennwort: 'gekapert-gekapert' } })).status, 403);
    assert.equal((await ruf('/api/kennwort', { cookie: k, body: { kennwort: 'mein-neues-kennwort', altesKennwort: 'falsch' } })).status, 400);
    assert.equal((await ruf('/api/kennwort', { cookie: k, body: { kennwort: 'mein-neues-kennwort', altesKennwort: 'noch-ein-kennwort' } })).status, 200);
    const zk = (await ruf('/api/zustand', { cookie: k })).daten;
    assert.deepEqual([zk.rechte.kontakt.schreiben, zk.rechte.kontakt.loeschen, zk.rechte.benutzer.schreiben], [true, false, false]);
    assert.deepEqual(zk.projekte, []);

    // Live-Strom der Kollegin: Kontakte kommen an, das Projekt (kein Mitglied) nicht.
    const strom = await fetch(adresse + `/api/strom?seit=${s0.stand + 1}`, { headers: { cookie: k } });
    const leser = strom.body!.getReader();
    const id = randomUUID();
    const antwort = await ruf('/api/befehle', { cookie, body: { befehle: [
      bef({ art: 'anlegen', objektId: id, werte: { name: 'Dach GmbH' } }),
      bef({ objektId: id, werte: { email: 'kaputt' } }),
      bef({ objekt: 'projekt', objektId: s0.objekte.projekt[0].id, werte: { ort: 'Geheim' } }),
      bef({ objektId: id, werte: { ort: 'Essen' } }),
    ] } });
    assert.deepEqual(antwort.daten.ergebnis.map((e: any) => !!e.fehler), [false, true, false, false]);
    let text = '';
    while (!/"ort":"Essen"/.test(text)) text += new TextDecoder().decode((await leser.read()).value);
    assert.ok(text.indexOf('Dach GmbH') < text.indexOf('"ort":"Essen"'));
    assert.match(text, /event: aktuell/);
    assert.doesNotMatch(text, /Geheim/);

    // Sperren: der Strom der Kollegin endet, ihre Sitzung gilt nicht mehr.
    await ruf('/api/befehle', { cookie, body: { befehle: [bef({ objekt: 'benutzer', objektId: kid, werte: { gesperrt: true } })] } });
    for (;;) { const t = await leser.read(); if (t.done) break; }
    assert.equal((await ruf('/api/schnappschuss', { cookie: k })).status, 401);

    await ruf('/api/abmelden', { cookie, body: {} });
    assert.equal((await ruf('/api/schnappschuss', { cookie })).status, 401);
  } finally { await app.close(); await weg(); }
});
