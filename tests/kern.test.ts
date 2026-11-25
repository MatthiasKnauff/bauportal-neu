// Tests gegen eine echte Datenbank: Kern, Protokoll, Rechte, Versionen, Übernahme (IFC, Assistent, Kataloge),
// Druckwerk, KI, Wetter, Fotos und der Server als Ganzes. Ohne grüne Tests baut die Pipeline kein Image.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { register } from '../src/module';
import { kontakt } from '../src/module/adressen/beipackzettel';
import { Eingabefehler, pruefeWerte } from '../src/kern/modell';
import { anwenden, gegenbefehl, type Befehl, type Zeile } from '../src/kern/befehl';
import { SYSTEM, alsBenutzer, schemaAnlegen, verbinden, type Absender, type Db } from '../src/server/db';
import { Ablehnung, befehlAusfuehren, befehleSeit, schnappschuss } from '../src/server/protokoll';
import { festeKennung, grundausstattung } from '../src/server/grundausstattung';
import { kennwortSetzen } from '../src/server/anmeldung';
import { baueServer } from '../src/server/server';
import { versionKopieren, versionsregelnAnmelden } from '../src/server/versionen';
import { gebaeudemodellRegelnAnmelden } from '../src/server/gebaeudemodell';
import { kostengruppeNummer } from '../src/module/gebaeudemodell/beipackzettel';
import { uWert } from '../src/module/gebaeudemodell/bauphysik';
import { geheimnisLesen, geheimnisSetzen } from '../src/server/ablage';
import { planen } from '../src/server/ifc';
import { planeSchaetzung } from '../src/server/assistent';
import { seiteBauen } from '../src/server/druck';
import { kiText } from '../src/server/ki';
import { katalogPlanen } from '../src/server/updates';
import { wetterFuer, wetterlage } from '../src/server/wetter';
import { fotoAblegen } from '../src/server/foto';
import { aufbauText } from '../src/server/aufbau';
import { altAnmelden, altFotosHolen, altdatenLesen, altdatenPlanen } from '../src/server/altdaten';
// @ts-expect-error – Werkzeug in reinem JavaScript
import { aufbauLesen } from '../tools/aufbau.mjs';
import { existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { anonymisieren, klartext } from '../src/kern/anonym';
import { createServer } from 'node:http';
import { schaetzen } from '../src/module/gebaeudemodell/schaetzung';
import { gebaeude as gebaeudeModell } from '../src/module/gebaeudemodell/beipackzettel';
import { vorgangAusfuehren } from '../src/server/protokoll';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATEN_PFAD = mkdtempSync(path.join(tmpdir(), 'bp-daten-'));

versionsregelnAnmelden(register);
gebaeudemodellRegelnAnmelden();

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

test('Versionen: erste ist gültig, genau eine gültig, Kopie im Projekt und in ein anderes Projekt', async () => {
  const { db, weg } = await frischeDb();
  try {
    const { leitung, mit } = await leute(db);
    const [p1, p2, vA, vB] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await tun(db, leitung, { objekt: 'projekt', art: 'anlegen', objektId: p1, werte: { name: 'Haus A' } });
    await tun(db, leitung, { objekt: 'projekt', art: 'anlegen', objektId: p2, werte: { name: 'Haus B' } });
    const ver = (id: string, name: string, projekt = p1, bereich = 'bauzeitenplan') => tun(db, leitung, { objekt: 'version', art: 'anlegen', objektId: id, werte: { projekt, bereich, name } });
    assert.equal((await ver(vA, 'Startversion')).werte!.gueltig, true, 'die erste Version ist gültig');
    assert.equal((await ver(vB, 'Test 2')).werte!.gueltig, false);
    await assert.rejects(ver(randomUUID(), 'x', p1, 'gibtsnicht'), Ablehnung);
    const vorgang = (version: string, name: string, projekt = p1) => tun(db, leitung, { objekt: 'vorgang', art: 'anlegen', werte: { projekt, version, name, anfang_nicht_vor: '2026-12-01', dauer: 5 } });
    await vorgang(vA, 'Rohbau'); await vorgang(vA, 'Dach');
    const id = async (name: string) => (await schnappschuss(db, register, leitung)).objekte.vorgang!.find((x) => x.werte.name === name)!.id;
    await tun(db, leitung, { objekt: 'verknuepfung', art: 'anlegen', werte: { projekt: p1, version: vA, von: await id('Rohbau'), nach: await id('Dach'), art: 'ea', abstand: 2 } });
    await assert.rejects(vorgang(randomUUID(), 'ohne Version'), Ablehnung);
    await assert.rejects(vorgang(vA, 'falsches Projekt', p2), Ablehnung);
    await assert.rejects(tun(db, leitung, { objekt: 'vorgang', art: 'anlegen', werte: { projekt: p1, version: vA, name: 'x', anfang_nicht_vor: '2026-02-30' } }), Eingabefehler, 'kein gültiges Datum');
    await assert.rejects(tun(db, mit, { objekt: 'version', art: 'anlegen', werte: { projekt: p1, bereich: 'bauzeitenplan', name: 'x' } }), Ablehnung, 'Mitarbeiter:in ohne Mitgliedschaft und Recht');

    // B wird gültig -> A ist es nicht mehr, und das steht als Folgebefehl im Protokoll
    await assert.rejects(tun(db, leitung, { objekt: 'version', objektId: vA, werte: { gueltig: false } }), /andere Version/);
    await tun(db, leitung, { objekt: 'version', objektId: vB, werte: { gueltig: true } });
    const gueltig = async () => (await schnappschuss(db, register, leitung)).objekte.version!.filter((v) => v.werte.gueltig && !v.geloescht).map((v) => v.werte.name).sort();
    assert.deepEqual(await gueltig(), ['Test 2']);
    assert.ok((await befehleSeit(db, leitung, 0)).some((b) => b.objekt === 'version' && b.objektId === vA && b.werte?.gueltig === false));
    await assert.rejects(tun(db, leitung, { objekt: 'version', art: 'loeschen', objektId: vB }), /gültige Version/);

    // Kopie im selben Projekt und in ein anderes Projekt
    const vC = randomUUID(), vD = randomUUID(), vorgangC = randomUUID();
    await versionKopieren(db, register, leitung, { vorgang: vorgangC, quelle: vA, projekt: p1, name: 'nach Bauherrengespräch', versionId: vC });
    await versionKopieren(db, register, leitung, { vorgang: vorgangC, quelle: vA, projekt: p1, name: 'nach Bauherrengespräch', versionId: vC });   // doppelt gesendet: wirkt einmal
    await versionKopieren(db, register, leitung, { vorgang: randomUUID(), quelle: vA, projekt: p2, name: 'aus Haus A', versionId: vD });
    await assert.rejects(versionKopieren(db, register, leitung, { vorgang: randomUUID(), quelle: vA, projekt: p1, name: '', versionId: randomUUID() }), Eingabefehler);
    const s = await schnappschuss(db, register, leitung);
    const in_ = (v: string) => s.objekte.vorgang!.filter((x) => x.werte.version === v).map((x) => [x.werte.name, x.werte.projekt]).sort();
    assert.deepEqual(in_(vC), [['Dach', p1], ['Rohbau', p1]]);
    assert.deepEqual(in_(vD), [['Dach', p2], ['Rohbau', p2]]);
    assert.equal(s.objekte.vorgang!.length, 6);
    const kopie = s.objekte.verknuepfung!.find((x) => x.werte.version === vC)!;
    const name = (vid: unknown) => s.objekte.vorgang!.find((x) => x.id === vid)!;
    assert.deepEqual([name(kopie.werte.von).werte.name, name(kopie.werte.von).werte.version, name(kopie.werte.nach).werte.name, kopie.werte.abstand], ['Rohbau', vC, 'Dach', 2], 'Verknüpfungen zeigen in der Kopie auf die kopierten Leistungen');
    assert.deepEqual(await gueltig(), ['Test 2', 'aus Haus A'], 'im anderen Projekt ist die erste Version dort gültig');
  } finally { await weg(); }
});

test('Gebäudemodell: Herkunft je Wert, Verweise wandern beim Kopieren einer Version mit', async () => {
  const { db, weg } = await frischeDb();
  try {
    const { leitung } = await leute(db);
    const [p, v, g, eg, og] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await tun(db, leitung, { objekt: 'projekt', art: 'anlegen', objektId: p, werte: { name: 'Haus A' } });
    await tun(db, leitung, { objekt: 'version', art: 'anlegen', objektId: v, werte: { projekt: p, bereich: 'gebaeudemodell', name: 'Vorentwurf' } });
    const z = { projekt: p, version: v };
    // Werte aus einer IFC-Datei tragen ihre Herkunft – aber nur die gefüllten
    await tun(db, leitung, { objekt: 'gebaeude', art: 'anlegen', objektId: g, herkunft: 'ifc', werte: { ...z, name: 'Wohnhaus', bgf: 420 } });
    await tun(db, leitung, { objekt: 'geschoss', art: 'anlegen', objektId: eg, werte: { ...z, gebaeude: g, name: 'EG', ebene: 0 } });
    await tun(db, leitung, { objekt: 'geschoss', art: 'anlegen', objektId: og, werte: { ...z, gebaeude: g, name: 'OG', ebene: 1 } });
    const w = randomUUID();
    await tun(db, leitung, { objekt: 'bauteil', art: 'anlegen', objektId: w, werte: { ...z, name: 'Außenwand Nord', art: 'aussenwand', geschoss: eg } });
    await tun(db, leitung, { objekt: 'bauteil', objektId: w, herkunft: 'geschaetzt', werte: { menge: 38.5 } });
    await assert.rejects(tun(db, leitung, { objekt: 'bauteil', objektId: w, herkunft: 'Böse!', werte: { menge: 1 } }), Ablehnung);
    const lies = async () => (await schnappschuss(db, register, leitung)).objekte;
    let o = await lies();
    assert.deepEqual(o.gebaeude![0]!.herkunft, { projekt: 'ifc', version: 'ifc', name: 'ifc', bgf: 'ifc' });
    assert.deepEqual(o.bauteil![0]!.herkunft, { menge: 'geschaetzt' });
    assert.equal(o.geschoss![0]!.herkunft, undefined, 'von Hand: keine Kennzeichnung');
    // von Hand überschrieben: die Kennzeichnung fällt weg
    await tun(db, leitung, { objekt: 'bauteil', objektId: w, werte: { menge: 40 } });
    o = await lies();
    assert.equal(o.bauteil![0]!.herkunft, undefined);
    // Das Protokoll von vorn abgespielt ergibt denselben Stand – samt Herkunft
    const zeilen = new Map<string, Zeile>();
    for (const b of await befehleSeit(db, leitung, 0)) { const x = anwenden(zeilen.get(b.objektId), b); if (x) zeilen.set(x.id, x); }
    const alle = Object.values(o).flat().sort((x, y) => x.id.localeCompare(y.id));
    assert.deepEqual([...zeilen.values()].sort((x, y) => x.id.localeCompare(y.id)), alle);

    // Kopie der Version: Bauteil zeigt auf das kopierte Geschoss, das Geschoss auf das kopierte Gebäude
    const v2 = randomUUID();
    await versionKopieren(db, register, leitung, { vorgang: randomUUID(), quelle: v, projekt: p, name: 'Entwurf', versionId: v2 });
    o = await lies();
    const in2 = <T extends Zeile>(l: T[]) => l.filter((x) => x.werte.version === v2);
    const g2 = in2(o.gebaeude!)[0]!, eg2 = in2(o.geschoss!).find((x) => x.werte.name === 'EG')!, w2 = in2(o.bauteil!)[0]!;
    assert.notEqual(g2.id, g);
    assert.equal(eg2.werte.gebaeude, g2.id);
    assert.equal(w2.werte.geschoss, eg2.id);
    assert.equal(in2(o.geschoss!).length, 2);
    await tun(db, leitung, { objekt: 'bauteil', objektId: w, herkunft: 'geschaetzt', werte: { material: 'Mauerwerk 36,5' } });
    const v3 = randomUUID();
    await versionKopieren(db, register, leitung, { vorgang: randomUUID(), quelle: v, projekt: p, name: 'Stand 3', versionId: v3 });
    o = await lies();
    assert.deepEqual(o.bauteil!.find((x) => x.werte.version === v3)!.herkunft, { material: 'geschaetzt' }, 'die Herkunft wandert in die Kopie mit');
    assert.deepEqual(o.gebaeude!.find((x) => x.werte.version === v3)!.herkunft, { name: 'ifc', bgf: 'ifc' });
  } finally { await weg(); }
});

test('IFC: erster Plan legt an, neuer Planstand ändert nur, was nicht von Hand geändert wurde', async () => {
  const { db, weg } = await frischeDb();
  try {
    const { leitung } = await leute(db);
    const wer = { ...leitung, anmeldename: 'leitung', rolle: 'bueroleitung' };
    const [p, v] = [randomUUID(), randomUUID()];
    await tun(db, leitung, { objekt: 'projekt', art: 'anlegen', objektId: p, werte: { name: 'Haus A' } });
    await tun(db, leitung, { objekt: 'version', art: 'anlegen', objektId: v, werte: { projekt: p, bereich: 'gebaeudemodell', name: 'Vorentwurf' } });
    // Kostengruppen-Katalog (Ausschnitt): ohne ihn bleiben Bauteile ohne Kostengruppe
    const kg: Record<string, string> = {};
    for (const n of ['330', '331', '334', '599']) { kg[n] = randomUUID(); await tun(db, leitung, { objekt: 'kostengruppe', art: 'anlegen', objektId: kg[n], werte: { nummer: n, name: 'KG ' + n } }); }
    const schichten = [{ material: 'Putz', dicke: 1.5 }, { material: 'Mauerwerk', dicke: 36.5 }];
    const wand = (kennung: string, name: string, menge: number, geschoss = 'eg') => ({ kennung, art: 'aussenwand', name, geschoss, lage: 'aussen', menge, einheit: 'm2', abmessung: '', schichten, tragend: kennung === 'w1' ? true : null });
    const fenster = { kennung: 'f1', art: 'fenster', name: 'Fenster', geschoss: 'eg', lage: 'aussen', menge: 2, einheit: 'm2', abmessung: '', schichten: [], tragend: null, wand: 'w1' };
    const plan1 = { schema: 'IFC4', uebersprungen: {}, flaechen_aus_geometrie: 0,
      gebaeude: [{ kennung: 'haus', name: 'Wohnhaus' }],
      geschosse: [{ kennung: 'eg', name: 'EG', ebene: 0, hoehe: 2.85, gebaeude: 'haus' }, { kennung: 'og', name: 'OG', ebene: 1, hoehe: null, gebaeude: 'haus' }],
      raeume: [{ kennung: 'r1', nummer: '0.01', name: 'Wohnen', nutzung: '', flaeche: 28.4, hoehe: null, geschoss: 'eg' }, { kennung: 'r2', nummer: 'x', name: 'ohne Geschoss', nutzung: '', flaeche: 1, hoehe: null, geschoss: null }],
      bauteile: [wand('w1', 'Außenwand Nord', 22), wand('w2', 'Außenwand Süd', 22), wand('w3', 'Außenwand OG', 16.5, 'og'), fenster] };
    const a = await planen(db, register, wer, p, v, plan1);
    assert.deepEqual([a.je.gebaeude!.neu, a.je.geschoss!.neu, a.je.raum!.neu, a.je.bauteil!.neu, a.ohneGeschoss], [1, 2, 1, 4, 1]);
    assert.deepEqual([a.je.aufbau!.neu, a.je.aufbau_schicht!.neu], [1, 2], 'gleiche Schichtfolge: ein Aufbau für alle drei Wände');
    await vorgangAusfuehren(db, register, wer, a.liste);
    const lies = async () => (await schnappschuss(db, register, leitung)).objekte;
    let o = await lies();
    const w1 = o.bauteil!.find((x) => x.werte.kennung === 'w1')!;
    assert.equal(w1.werte.geschoss, o.geschoss!.find((x) => x.werte.kennung === 'eg')!.id);
    assert.equal(w1.herkunft!.menge, 'ifc');
    const auf = o.aufbau!.find((x) => !x.geloescht)!;
    assert.equal(auf.werte.name, 'Putz 1,5 · Mauerwerk 36,5 (38 cm)');
    assert.ok(o.bauteil!.filter((x) => x.werte.art === 'aussenwand').every((x) => x.werte.aufbau === auf.id));
    assert.deepEqual(o.aufbau_schicht!.filter((x) => x.werte.aufbau === auf.id).map((x) => [x.werte.reihe, x.werte.material, x.werte.dicke]).sort(), [[1, 'Putz', 1.5], [2, 'Mauerwerk', 36.5]]);
    const f1 = o.bauteil!.find((x) => x.werte.kennung === 'f1')!;
    assert.equal(f1.werte.wand, w1.id, 'das Fenster kennt seine Wand');
    assert.deepEqual([w1.werte.tragend, w1.werte.kostengruppe, f1.werte.kostengruppe, o.bauteil!.find((x) => x.werte.kennung === 'w2')!.werte.kostengruppe], ['ja', kg['331'], kg['334'], kg['330']]);
    assert.equal((await planen(db, register, wer, p, v, plan1)).befehle, 0, 'derselbe Plan noch einmal: nichts zu tun');

    // Von Hand: Menge von w1 korrigiert, eigenes Bauteil ohne Plan angelegt
    await tun(db, leitung, { objekt: 'bauteil', objektId: w1.id, werte: { menge: 23.5 } });
    await tun(db, leitung, { objekt: 'bauteil', art: 'anlegen', werte: { projekt: p, version: v, name: 'Vordach (von Hand)', art: 'sonstiges' } });
    // Neuer Planstand: w1 und w2 mit anderer Menge, w3 entfällt, w4 neu
    const plan2 = { ...plan1, bauteile: [wand('w1', 'Außenwand Nord', 25), wand('w2', 'Außenwand Süd', 24), wand('w4', 'Außenwand West', 30), fenster] };
    const b = await planen(db, register, wer, p, v, plan2);
    assert.deepEqual(b.je.bauteil, { neu: 1, geaendert: 1, entfernt: 1, unveraendert: 2, behalten: 1 });
    assert.equal(b.je.geschoss!.unveraendert, 2);
    await vorgangAusfuehren(db, register, wer, b.liste);
    o = await lies();
    const menge = (k: string) => o.bauteil!.find((x) => x.werte.kennung === k)!;
    assert.equal(menge('w1').werte.menge, 23.5, 'von Hand korrigiert: bleibt');
    assert.equal(menge('w2').werte.menge, 24);
    assert.equal(menge('w3').geloescht, true);
    assert.equal(o.bauteil!.find((x) => x.werte.name === 'Vordach (von Hand)')!.geloescht, false, 'was nicht aus dem Plan stammt, bleibt unberührt');
    // Der alte Planstand noch einmal: w3 kommt zurück, w4 entfällt
    const cplan = await planen(db, register, wer, p, v, plan1);
    await vorgangAusfuehren(db, register, wer, cplan.liste);
    o = await lies();
    assert.equal(o.bauteil!.find((x) => x.werte.kennung === 'w3')!.geloescht, false);
    assert.equal(o.bauteil!.filter((x) => !x.geloescht).length, 5);

    // Kostengruppe folgt Art, Lage, Tragfähigkeit – bis jemand sie von Hand setzt
    const kgVon = async (id: string) => (await lies()).bauteil!.find((x) => x.id === id)!.werte.kostengruppe;
    const w2 = o.bauteil!.find((x) => x.werte.kennung === 'w2')!.id;
    await tun(db, leitung, { objekt: 'bauteil', objektId: w2, werte: { tragend: 'ja' } });
    assert.equal(await kgVon(w2), kg['331']);
    await tun(db, leitung, { objekt: 'bauteil', objektId: w2, werte: { kostengruppe: kg['599']! } });
    await tun(db, leitung, { objekt: 'bauteil', objektId: w2, werte: { tragend: '' } });
    assert.equal(await kgVon(w2), kg['599'], 'von Hand gesetzt: bleibt');
    const neu = randomUUID();
    await tun(db, leitung, { objekt: 'bauteil', art: 'anlegen', objektId: neu, werte: { projekt: p, version: v, name: 'Fenster Süd', art: 'fenster', lage: 'aussen' } });
    assert.equal(await kgVon(neu), kg['334'], 'beim Anlegen gesetzt');
  } finally { await weg(); }
});

test('Assistent: Schätzung aus den Angaben, Antworten am Gebäude, ein Plan ersetzt das Geschätzte', async () => {
  // Mehrfachauswahl und Bedingungen im Modell
  assert.equal(pruefeWerte(gebaeudeModell, { massnahme: 'umbau,neubau' }, false).massnahme, 'neubau,umbau', 'gespeichert in der Reihenfolge der Optionen');
  assert.throws(() => pruefeWerte(gebaeudeModell, { massnahme: 'neubau,quatsch' }, false), Eingabefehler);
  // Die Rechnung: EFH, 2 Geschosse, Keller, ausgebautes Satteldach, 150 m² Wohnfläche
  const efh = { nutzung: 'efh', wohnflaeche: 150, geschosszahl: 2, keller: 'wu', dachform: 'sattel', dach_oben: 'ausgebaut', tragwerk: 'massiv', fassade: 'wdvs', fenster: 'holz' };
  const s = schaetzen(efh);
  assert.ok(!('fehlt' in s));
  assert.deepEqual(s.geschosse.map((g) => [g.name, g.ebene]), [['Keller', -1], ['Erdgeschoss', 0], ['1. Obergeschoss', 1], ['Dachgeschoss', 2]]);
  assert.equal(s.bgf, 274.1, '150 m² / 0,75 liegen in 2,7 Geschossen, der Keller kommt dazu');
  const teil = (k: string) => s.bauteile.find((b) => b.schluessel === k);
  assert.equal(teil('aussenwand:0')!.aufbau, 'Massivbau (Mauerwerk), WDVS mit Putz');
  assert.equal(teil('aussenwand:-1')!.name, 'Kellerwand Keller');
  assert.equal(teil('decke:2'), undefined, 'über dem ausgebauten Dach liegt keine Decke');
  assert.ok(teil('decke:1') && teil('dach:x') && teil('bodenplatte:-1') && !teil('fundament:-1'));
  assert.ok('fehlt' in schaetzen({ nutzung: 'efh' }), 'ohne Fläche keine Schätzung');
  const flach = schaetzen({ nutzung: 'buero', bgf: 900, geschosszahl: 3, dachform: 'flach' });
  assert.ok(!('fehlt' in flach) && flach.bauteile.filter((b) => b.art === 'decke').length === 2 && flach.bauteile.some((b) => b.art === 'fundament'));

  const { db, weg } = await frischeDb();
  try {
    const { leitung } = await leute(db);
    const wer = { ...leitung, anmeldename: 'leitung', rolle: 'bueroleitung' };
    const [p, v] = [randomUUID(), randomUUID()];
    await tun(db, leitung, { objekt: 'projekt', art: 'anlegen', objektId: p, werte: { name: 'Haus B' } });
    await tun(db, leitung, { objekt: 'version', art: 'anlegen', objektId: v, werte: { projekt: p, bereich: 'gebaeudemodell', name: 'Erste Idee' } });
    const lies = async () => (await schnappschuss(db, register, leitung)).objekte;
    const a = await planeSchaetzung(db, register, wer, p, v, null, { name: 'Wohnhaus', ...efh });
    assert.deepEqual([a.je.gebaeude!.neu, a.je.geschoss!.neu, a.je.bauteil!.neu], [1, 4, s.bauteile.length]);
    await vorgangAusfuehren(db, register, wer, a.liste);
    let o = await lies();
    const haus = o.gebaeude![0]!;
    assert.equal(haus.werte.fassade, 'wdvs');
    assert.deepEqual(haus.herkunft, { bgf: 'geschaetzt' }, 'die Antworten gelten als von Hand eingetragen, nur die gerechnete Fläche ist geschätzt');
    assert.equal(o.bauteil!.find((x) => x.werte.art === 'dach')!.herkunft!.menge, 'geschaetzt');
    assert.equal((await planeSchaetzung(db, register, wer, p, v, haus.id, efh)).liste.length, 0, 'dieselben Angaben noch einmal: nichts zu tun');

    // Von Hand: Fensterfläche im EG korrigiert. Dann ein Geschoss weniger – die Schätzung zieht nach, die Korrektur bleibt.
    const fenster = o.bauteil!.find((x) => String(x.werte.kennung).endsWith('fenster:0'))!;
    await tun(db, leitung, { objekt: 'bauteil', objektId: fenster.id, werte: { menge: 31 } });
    const b = await planeSchaetzung(db, register, wer, p, v, haus.id, { geschosszahl: 1 });
    assert.equal(b.je.geschoss!.entfernt, 1);
    assert.equal(b.je.bauteil!.behalten, 1);
    await vorgangAusfuehren(db, register, wer, b.liste);
    o = await lies();
    assert.equal(o.bauteil!.find((x) => x.id === fenster.id)!.werte.menge, 31);
    assert.equal(o.geschoss!.filter((x) => !x.geloescht).length, 3);

    // Jetzt kommt der Plan: ein Gebäude, EG und OG. Das Gebäude bleibt dasselbe (mit seinen Antworten),
    // das geschätzte EG wird das EG aus dem Plan, die geschätzten Bauteile entfallen.
    const eg = o.geschoss!.find((x) => !x.geloescht && x.werte.ebene === 0)!;
    const plan = { schema: 'IFC4', uebersprungen: {}, flaechen_aus_geometrie: 0, gebaeude: [{ kennung: 'haus', name: 'Haus aus dem Plan' }],
      geschosse: [{ kennung: 'eg', name: 'EG', ebene: 0, hoehe: 2.9, gebaeude: 'haus' }, { kennung: 'og', name: 'OG', ebene: 1, hoehe: 2.9, gebaeude: 'haus' }], raeume: [],
      bauteile: [{ kennung: 'w1', art: 'aussenwand', name: 'Außenwand Nord', geschoss: 'eg', lage: 'aussen', menge: 22, einheit: 'm2', abmessung: '', schichten: [] }] };
    const c = await planen(db, register, wer, p, v, plan);
    assert.deepEqual([c.je.gebaeude!.neu, c.je.gebaeude!.geaendert, c.je.geschoss!.neu, c.je.geschoss!.geaendert, c.je.geschoss!.entfernt], [0, 1, 0, 2, 1], 'EG und das geschätzte Dachgeschoss (Ebene 1) werden die Geschosse aus dem Plan, der Keller entfällt');
    assert.ok(c.hinweise.some((h) => h.includes('geschätzte Bauteile')));
    await vorgangAusfuehren(db, register, wer, c.liste);
    o = await lies();
    assert.equal(o.gebaeude!.filter((x) => !x.geloescht).length, 1);
    assert.deepEqual([o.gebaeude![0]!.id, o.gebaeude![0]!.werte.name, o.gebaeude![0]!.werte.kennung, o.gebaeude![0]!.werte.fassade], [haus.id, 'Wohnhaus', 'haus', 'wdvs'], 'der von Hand vergebene Name bleibt');
    assert.deepEqual([o.geschoss!.find((x) => x.id === eg.id)!.werte.kennung, o.geschoss!.find((x) => x.id === eg.id)!.werte.name], ['eg', 'EG']);
    assert.deepEqual(o.bauteil!.filter((x) => !x.geloescht).map((x) => x.werte.kennung), ['w1']);
    // Danach schätzt der Assistent nichts mehr dazu – er trägt nur noch Angaben ein
    const d = await planeSchaetzung(db, register, wer, p, v, haus.id, { heizung: 'wp_luft' });
    assert.deepEqual(d.liste.map((x) => [x.objekt, x.art]), [['gebaeude', 'aendern']]);
  } finally { await weg(); }
});

test('Druckwerk: Seite aus dem Objekt, Einstellungen des Büros, nur was man sehen darf', async () => {
  const { db, weg } = await frischeDb();
  try {
    const { leitung, mit, gast } = await leute(db);
    const als = (w: Absender, rolle: string) => ({ ...w, anmeldename: w.name, rolle });
    const [p, b] = [randomUUID(), randomUUID()];
    await tun(db, leitung, { objekt: 'projekt', art: 'anlegen', objektId: p, werte: { name: 'Haus <A> & Söhne' } });
    await tun(db, leitung, { objekt: 'buero', art: 'aendern', objektId: '00000000-0000-4000-8000-0000000b0e01', werte: { name: 'GK3', ort: 'Essen', plz: '45127' } });
    await tun(db, leitung, { objekt: 'tagesbericht', art: 'anlegen', objektId: b, werte: { projekt: p, nummer: 7, datum: '2026-11-24', uhrzeit: '09:30', titel: 'Bodenplatte', wetter: 'regen', temperatur: 4.5, bauleitung: leitung.id, aufgeraeumt: true } });
    const firma = randomUUID();
    await tun(db, leitung, { objekt: 'kontakt', art: 'anlegen', objektId: firma, werte: { name: 'Rohbau Schmitz GmbH' } });
    const eintrag = (art: string, reihe: number, werte: Record<string, unknown>) => tun(db, leitung, { objekt: 'bericht_eintrag', art: 'anlegen', werte: { projekt: p, bericht: b, art, reihe, ...werte } as never });
    await eintrag('mangel', 2, { text: 'Riss in der Sohle\n<b>fett?</b>', firma, frist: '2026-12-01' });
    await eintrag('mangel', 1, { text: 'Abstandhalter fehlen', erledigt: true });
    await eintrag('anwesend', 1, { firma, text: 'Bewehrung', personen: 4 });
    const A = 'bautagebuch.tagesbericht';
    let s = await seiteBauen(db, register, als(leitung, 'bueroleitung'), A, b);
    assert.equal(s.name, 'Tagesbericht 7 24.11.2026 Haus -A- & Söhne.pdf');
    for (const t of ['<h1 data-stelle="titel.text">Tagesbericht Nr. 7</h1>', '24.11.2026 · Bodenplatte', '<dt>Wetter</dt><dd>Regen</dd>', '<dd>4,5</dd>', '<dt>Bauleitung</dt><dd>leitung</dd>', '<dt>Baustelle aufgeräumt</dt><dd>Ja</dd>', '<dt>Maßkontrolle</dt><dd>Nein</dd>',
      'Haus &lt;A&gt; &amp; Söhne', '45127 Essen', '&lt;b&gt;fett?&lt;/b&gt;', 'GK3 · Tagesbericht Nr. 7 vom 24.11.2026', 'counter(pages)', '<h2>Mängel</h2>', '<h2>Anwesende</h2>', 'Rohbau Schmitz GmbH</td>', '01.12.2026', '>✓</td>']) assert.ok(s.html.includes(t), t);
    assert.ok(s.html.indexOf('Abstandhalter fehlen') < s.html.indexOf('Riss in der Sohle'), 'Einträge stehen in der Reihenfolge des Berichts');
    assert.ok(!s.html.includes('<h2>Weisungen</h2>'), 'leere Abschnitte fallen weg');
    // Das Büro stellt ein: andere Überschrift, Temperatur aus, Mängel auch leer zeigen, kleine Schrift
    for (const [stelle, wert] of [['titel.text', 'Bautagesbericht {nummer}'], ['angaben.temperatur.aus', 'ja'], ['weisung.leer', 'ja'], ['angaben.wetter.titel', 'Witterung'], ['mangel.frist.aus', 'ja'], ['mangel.text.titel', 'Mangel'], ['seite.schrift', 'klein']] as [string, string][]) {
      await tun(db, leitung, { objekt: 'druckeinstellung', art: 'anlegen', werte: { ausdruck: A, stelle, wert } });
    }
    await tun(db, leitung, { objekt: 'projekt_mitglied', art: 'anlegen', werte: { projekt: p, benutzer: mit.id } });
    s = await seiteBauen(db, register, als(mit, 'mitarbeiter'), A, b);
    for (const t of ['>Bautagesbericht 7</h1>', '<dt>Witterung</dt>', '<h2>Weisungen</h2>', '>Mangel</th>', 'font: 9pt']) assert.ok(s.html.includes(t), t);
    assert.ok(!s.html.includes('Temperatur') && !s.html.includes('01.12.2026'), 'ausgeblendetes Feld und ausgeblendete Spalte fehlen');
    await assert.rejects(tun(db, mit, { objekt: 'druckeinstellung', art: 'anlegen', werte: { ausdruck: A, stelle: 'kopf.aus', wert: 'ja' } }), Ablehnung, 'das Layout des Büros ändert nur, wer es darf');
    await assert.rejects(seiteBauen(db, register, als(gast, 'gast'), A, b), Ablehnung, 'kein Mitglied des Projekts: kein Ausdruck');
  } finally { await weg(); }
});

test('KI: nach außen nur ohne Namen, im Büro unverändert, Protokoll ohne Inhalt, Gäste nutzen keine KI', async () => {
  // Die Ersetzung selbst
  const e = anonymisieren('Herr Müller (Müller Bau GmbH, 0201 123456, info@mueller-bau.de) und müller sen. – IBAN DE12 3456 7890 1234 5678 90. Müllerstraße bleibt.', ['Müller Bau GmbH', 'Müller', 'ab']);
  assert.equal(e.karte.size, 5, 'Firma, Name, Telefon, E-Mail, IBAN – der zweite „müller“ bekommt dieselbe Nummer');
  assert.ok(!/Müller(?!straße)|müller |0201 123456|mueller-bau|DE12/.test(e.text), e.text);
  assert.ok(e.text.includes('Müllerstraße bleibt'), 'nur ganze Wörter');
  assert.match(e.text, /^Herr \[\[\d{12}\]\] \(\[\[\d{12}\]\], \[\[\d{12}\]\], \[\[\d{12}\]\]\) und \[\[(\d{12})\]\] sen\./);
  const [n] = [...e.karte.keys()];
  assert.equal(klartext(`Vor ${n} und [[${n}]] und [[999999999999]]`, e.karte), `Vor ${e.karte.get(n!)} und ${e.karte.get(n!)} und [[999999999999]]`, 'auch ohne Klammern zurück; Unbekanntes bleibt stehen');

  // Der Weg über den Server, mit einem nachgestellten KI-Ausgang
  const gesehen: { anweisung: string; text: string; art: string; schluessel: string }[] = [];
  const ausgang = createServer((req, res) => {
    let roh = ''; req.on('data', (t) => (roh += t)); req.on('end', () => {
      const b = JSON.parse(roh); gesehen.push(b);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ text: `Heute hat ${/\[\[\d{12}\]\]/.exec(b.text)?.[0] ?? 'Müller'} betoniert.`, ein: 30, aus: 9 }));
    });
  });
  await new Promise<void>((r) => ausgang.listen(0, '127.0.0.1', r));
  process.env.KIDIENST_URL = `http://127.0.0.1:${(ausgang.address() as { port: number }).port}`;
  const { db, weg } = await frischeDb();
  try {
    const { admin, mit, gast } = await leute(db);
    const als = (w: Absender, rolle: string) => ({ ...w, anmeldename: w.name, rolle });
    await tun(db, admin, { objekt: 'kontakt', art: 'anlegen', werte: { name: 'Rohbau Schmitz GmbH', ansprechpartner: 'Jörg Schmitz' } });
    const [buero, aussen, aus] = [randomUUID(), randomUUID(), randomUUID()];
    await tun(db, admin, { objekt: 'ki_anbindung', art: 'anlegen', objektId: buero, werte: { name: 'Büro-KI', art: 'ollama', adresse: 'http://ollama:11434', modell: 'llama', aktiv: true } });
    await tun(db, admin, { objekt: 'ki_anbindung', art: 'anlegen', objektId: aussen, werte: { name: 'Claude', art: 'claude', modell: 'claude-haiku-5-5', aktiv: true } });
    await tun(db, admin, { objekt: 'ki_anbindung', art: 'anlegen', objektId: aus, werte: { name: 'Aus', art: 'openai', modell: 'm', aktiv: false } });
    await assert.rejects(tun(db, mit, { objekt: 'ki_anbindung', art: 'anlegen', werte: { name: 'x', art: 'ollama' } }), Ablehnung, 'einrichten dürfen nur Administrator:innen');
    await geheimnisSetzen(db, `ki.${aussen}`, 'sk-geheim');
    const text = 'Schmitz hat betoniert, Rückfragen an Jörg Schmitz.';
    let r = await kiText(db, als(mit, 'mitarbeiter'), buero, 'ausformulieren', text);
    assert.deepEqual([r.extern, r.ersetzt, gesehen[0]!.text, gesehen[0]!.schluessel], [false, 0, text, ''], 'im Büro bleibt der Text, wie er ist');
    r = await kiText(db, als(mit, 'mitarbeiter'), aussen, 'glaetten', text);
    assert.ok(!/Schmitz|Jörg/.test(gesehen[1]!.text) && gesehen[1]!.anweisung.includes('doppelten eckigen Klammern') && gesehen[1]!.schluessel === 'sk-geheim', gesehen[1]!.text);
    assert.deepEqual([r.extern, r.ersetzt, r.vorschlag], [true, 2, 'Heute hat Schmitz betoniert.'], 'die Antwort kommt in Klartext zurück');
    await assert.rejects(kiText(db, als(mit, 'mitarbeiter'), aus, 'glaetten', text), /ausgeschaltet/);
    await assert.rejects(kiText(db, als(gast, 'gast'), buero, 'glaetten', text), /gibt es nicht/, 'Gäste sehen keine Anbindung');
    await assert.rejects(kiText(db, als(mit, 'mitarbeiter'), buero, 'dichten', text), Ablehnung);
    const p = (await db.query('select anbindung, aufgabe, extern, ersetzt, tokens_ein, fehler from kern_ki_ausgang order by id')).rows;
    assert.deepEqual(p, [{ anbindung: 'Büro-KI', aufgabe: 'ausformulieren', extern: false, ersetzt: 0, tokens_ein: 30, fehler: null }, { anbindung: 'Claude', aufgabe: 'glaetten', extern: true, ersetzt: 2, tokens_ein: 30, fehler: null }]);
    assert.ok(!JSON.stringify((await db.query('select * from kern_ki_ausgang')).rows).includes('betoniert'), 'im Protokoll steht, dass etwas hinausging – nicht was');
  } finally { await weg(); ausgang.close(); }
});

test('Kataloge: aus dem Kanal mit Prüfsumme, Vorschau, eigene Einträge und Änderungen des Büros bleiben', async () => {
  const datei = (version: number, eintraege: [string, string, string][]) => Buffer.from(JSON.stringify({ id: 'gewerke', version, stand: '2026-01', eintraege: eintraege.map(([schluessel, name, bereich]) => ({ schluessel, werte: { name, norm: schluessel.toUpperCase(), bereich } })) }));
  const dateien: Record<string, Buffer> = {
    '/gewerke/1.json': datei(1, [['din18330', 'Mauerarbeiten', 'rohbau'], ['din18331', 'Betonarbeiten', 'rohbau'], ['din18333', 'Betonwerksteinarbeiten', 'ausbau']]),
    '/gewerke/2.json': datei(2, [['din18330', 'Mauerarbeiten', 'rohbau'], ['din18331', 'Beton- und Stahlbetonarbeiten', 'rohbau'], ['din18340', 'Trockenbauarbeiten', 'ausbau']]),
  };
  let fassung = 1, falsch = false;
  const kanal = createServer((req, res) => {
    const d = dateien[`/gewerke/${fassung}.json`]!;
    if (req.url === '/index.json') return res.end(JSON.stringify({ kataloge: [
      { id: 'gewerke', titel: 'Gewerke', beschreibung: '', version: fassung, stand: '2026-01', quelle: 'Test', datei: `gewerke/${fassung}.json`, sha256: falsch ? 'f'.repeat(64) : createHash('sha256').update(d).digest('hex') },
      { id: 'unbekannt', titel: 'kennt dieses Programm nicht', version: 1, stand: '', quelle: '', datei: 'x.json', sha256: '' }] }));
    res.end(dateien[req.url!] ?? '');
  });
  await new Promise<void>((r) => kanal.listen(0, '127.0.0.1', r));
  process.env.KATALOG_KANAL = `http://127.0.0.1:${(kanal.address() as { port: number }).port}/`;
  const { db, weg } = await frischeDb();
  try {
    const { admin, leitung } = await leute(db);
    const wer = { ...admin, anmeldename: 'admin', rolle: 'admin' };
    const lies = async () => (await schnappschuss(db, register, admin)).objekte.gewerk!.filter((x) => !x.geloescht);
    falsch = true;
    await assert.rejects(katalogPlanen(db, register, wer, 'gewerke'), /Prüfsumme/);
    falsch = false;
    await assert.rejects(katalogPlanen(db, register, wer, 'unbekannt'), Ablehnung);
    let p = await katalogPlanen(db, register, wer, 'gewerke');
    assert.equal(p.je.gewerk!.neu, 3);
    await vorgangAusfuehren(db, register, wer, p.liste);
    assert.deepEqual((await lies()).map((x) => [x.werte.kennung, x.herkunft?.name]).sort(), [['din18330', 'katalog'], ['din18331', 'katalog'], ['din18333', 'katalog']]);
    assert.equal((await katalogPlanen(db, register, wer, 'gewerke')).liste.length, 0, 'derselbe Stand noch einmal: nichts zu tun');
    // Das Büro: eigenes Gewerk, eigener Name für die Mauerarbeiten
    await tun(db, leitung, { objekt: 'gewerk', art: 'anlegen', werte: { name: 'Lehmbau (eigenes Gewerk)' } });
    await tun(db, leitung, { objekt: 'gewerk', objektId: (await lies()).find((x) => x.werte.kennung === 'din18330')!.id, werte: { name: 'Maurer' } });
    fassung = 2;
    p = await katalogPlanen(db, register, wer, 'gewerke');
    assert.deepEqual(p.je.gewerk, { neu: 1, geaendert: 1, entfernt: 1, unveraendert: 1, behalten: 1 }, 'die Mauerarbeiten heißen im Büro anders – das bleibt');
    await vorgangAusfuehren(db, register, wer, p.liste);
    assert.deepEqual((await lies()).map((x) => x.werte.name).sort(), ['Beton- und Stahlbetonarbeiten', 'Lehmbau (eigenes Gewerk)', 'Maurer', 'Trockenbauarbeiten']);
  } finally { await weg(); kanal.close(); }
});

test('Wetter: Anschrift der Baustelle → Koordinaten → Werte für Tag und Stunde', async () => {
  assert.deepEqual([wetterlage(0, 5, 20), wetterlage(3, 5, 20), wetterlage(61, 10, 8), wetterlage(73, 10, -1), wetterlage(2, 5, -3), wetterlage(2, 70, 10), wetterlage(95, 20, 22)], ['sonnig', 'bewoelkt', 'regen', 'schnee', 'frost', 'sturm', 'sturm']);
  const gesehen: string[] = [];
  const netz = createServer((req, res) => {
    gesehen.push(req.url!);
    res.setHeader('content-type', 'application/json');
    if (req.url!.startsWith('/search')) return res.end(JSON.stringify(req.url!.includes('Nirgendwo') ? [] : [{ lat: '51.455643', lon: '7.011555' }]));
    const std = <T>(w: (i: number) => T) => Array.from({ length: 24 }, (_, i) => w(i));
    res.end(JSON.stringify({ hourly: { time: std((i) => `2026-11-24T${String(i).padStart(2, '0')}:00`), temperature_2m: std((i) => 2 + i / 4), relative_humidity_2m: std(() => 81.4), precipitation: std((i) => (i === 9 ? 1.25 : 0.1)), weather_code: std((i) => (i === 9 ? 61 : 3)), wind_speed_10m: std(() => 14.6) } }));
  });
  await new Promise<void>((r) => netz.listen(0, '127.0.0.1', r));
  const basis = `http://127.0.0.1:${(netz.address() as { port: number }).port}`;
  process.env.WETTER_GEO_URL = basis; process.env.WETTER_URL = `${basis}/wetter`;
  const { db, weg } = await frischeDb();
  try {
    const { leitung, gast } = await leute(db);
    const als = (w: Absender, rolle: string) => ({ ...w, anmeldename: w.name, rolle });
    const [p, leer, fern] = [randomUUID(), randomUUID(), randomUUID()];
    await tun(db, leitung, { objekt: 'projekt', art: 'anlegen', objektId: p, werte: { name: 'Haus A', strasse: 'Musterweg 1', plz: '45127', ort: 'Essen' } });
    await tun(db, leitung, { objekt: 'projekt', art: 'anlegen', objektId: leer, werte: { name: 'ohne Anschrift' } });
    await tun(db, leitung, { objekt: 'projekt', art: 'anlegen', objektId: fern, werte: { name: 'Haus B', ort: 'Nirgendwo' } });
    const w = await wetterFuer(db, als(leitung, 'bueroleitung'), p, '2026-11-24', '09:30');
    assert.deepEqual(w, { wetter: 'regen', temperatur: 4.3, luftfeuchte: 81, wind: 15, niederschlag: 3.6, ort: 'Musterweg 1, 45127 Essen' });
    assert.ok(gesehen[0]!.includes(encodeURIComponent('Musterweg 1, 45127 Essen')) && !gesehen.join(' ').includes('Haus'), 'hinaus geht die Anschrift, nicht der Projektname');
    assert.ok(gesehen[1]!.includes('latitude=51.456&longitude=7.012') && gesehen[1]!.includes('start_date=2026-11-24'), 'Koordinaten gerundet');
    await wetterFuer(db, als(leitung, 'bueroleitung'), p, '2026-11-24', '15:00');
    assert.equal(gesehen.filter((u) => u.startsWith('/search')).length, 1, 'die Anschrift wird nur einmal nachgeschlagen');
    await assert.rejects(wetterFuer(db, als(leitung, 'bueroleitung'), leer, '2026-11-24', ''), /Anschrift der Baustelle/);
    await assert.rejects(wetterFuer(db, als(leitung, 'bueroleitung'), fern, '2026-11-24', ''), /nicht gefunden/);
    await assert.rejects(wetterFuer(db, als(gast, 'gast'), p, '2026-11-24', ''), /gibt es nicht/, 'nur für Projekte, die man sehen darf');
  } finally { await weg(); netz.close(); }
});

test('Fotos: Vorschaubild im Bauportal, Original abgelegt, im Ausdruck eingebettet – nur wer darf', async () => {
  const { db, weg } = await frischeDb();
  try {
    const { leitung, mit, gast } = await leute(db);
    const als = (w: Absender, rolle: string) => ({ ...w, anmeldename: w.name, rolle });
    const [p, b] = [randomUUID(), randomUUID()];
    await tun(db, leitung, { objekt: 'projekt', art: 'anlegen', objektId: p, werte: { name: 'Haus A' } });
    await tun(db, leitung, { objekt: 'tagesbericht', art: 'anlegen', objektId: b, werte: { projekt: p, nummer: 3, datum: '2026-11-24', titel: 'Sohle' } });
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]);
    const hoch = { projekt: p, bericht: b, name: '../IMG:0001.jpg', original: jpeg, vorschau: jpeg };
    // Ohne eingerichtete Ablage (und auf dem Testserver immer) bleibt das Original im Speicher des Bauportals
    const f = await fotoAblegen(db, register, 'test', als(leitung, 'bueroleitung'), hoch);
    assert.equal(f.ort, 'bauportal');
    const z = (await schnappschuss(db, register, leitung)).objekte.foto!.find((x) => x.id === f.id)!;
    assert.deepEqual([z.werte.name, z.werte.ort, z.werte.reihe, z.werte.bericht], ['..-IMG-0001.jpg'.replace(/^\.+/, ''), 'bauportal', 1, b]);
    const ordner = path.join(process.env.DATEN_PFAD!, 'originale', p);
    assert.ok(existsSync(path.join(ordner, String(z.werte.pfad))) && readdirSync(ordner).length === 1, 'Original liegt im Daten-Volume');
    assert.equal((await db.query('select length(bild) as n from kern_vorschau where id = $1', [f.id])).rows[0].n, 2004);
    assert.equal(((await fotoAblegen(db, register, 'test', als(leitung, 'bueroleitung'), { ...hoch, name: 'zwei.jpg' })) && (await schnappschuss(db, register, leitung)).objekte.foto!.length), 2);
    await assert.rejects(fotoAblegen(db, register, 'test', als(leitung, 'bueroleitung'), { ...hoch, original: Buffer.from('kein Bild') }), /kein Foto/);
    await assert.rejects(fotoAblegen(db, register, 'test', als(leitung, 'bueroleitung'), { ...hoch, bericht: randomUUID() }), /Bericht gibt es nicht/);
    await assert.rejects(fotoAblegen(db, register, 'test', als(mit, 'mitarbeiter'), hoch), Ablehnung, 'kein Mitglied des Projekts');
    await assert.rejects(fotoAblegen(db, register, 'test', als(gast, 'gast'), hoch), Ablehnung);
    const s = await seiteBauen(db, register, als(leitung, 'bueroleitung'), 'bautagebuch.tagesbericht', b);
    assert.ok(s.html.includes('<h2>Fotos</h2>') && s.html.includes(`<img src="data:image/jpeg;base64,${jpeg.toString('base64').slice(0, 40)}`), 'im PDF steckt das Vorschaubild selbst');
  } finally { await weg(); }
});

test('Aufbau: jede Datei ist ein Baustein mit Beschreibung, der Kern kennt niemanden', () => {
  const q = aufbauLesen() as import('../src/server/aufbau').Quelltext;
  const ohne = q.bausteine.filter((b) => /\.(ts|tsx|mjs|py)$/.test(b.pfad) && !b.beschreibung).map((b) => b.pfad);
  assert.deepEqual(ohne, [], 'jede Quelldatei beginnt mit einem Kommentar, der sagt, wofür sie da ist');
  const d = q.bausteine.find((b) => b.pfad === 'src/server/druck.ts')!;
  assert.ok(d.bereich === 'server' && d.bindetEin.includes('src/kern/druck.ts') && d.stelltBereit.includes('seiteBauen'));
  // Die Schichten: Der Kern bindet nur Kern ein, die Module nur Kern und Module, der Baukasten nichts aus den Modul-Ansichten
  const bereich = new Map(q.bausteine.map((b) => [b.pfad, b.bereich]));
  const verstoesse = q.bausteine.flatMap((b) => b.bindetEin.filter((z) =>
    (b.bereich === 'kern' && bereich.get(z) !== 'kern') || (b.bereich === 'module' && !['kern', 'module'].includes(bereich.get(z)!)) || (b.bereich === 'server' && ['oberflaeche', 'baukasten'].includes(bereich.get(z)!))).map((z) => `${b.pfad} → ${z}`));
  assert.deepEqual(verstoesse, [], 'kein Baustein greift in eine Schicht über sich');
  const text = aufbauText(register, q, ['POST /api/befehle']);
  for (const t of ['### Bautagebuch (`bautagebuch`', '- `firma` verweis → kontakt', '### `src/kern/modell.ts`', 'POST /api/befehle', 'KI-Ausgang']) assert.ok(text.includes(t), t);
});

test('Übernahme aus dem alten Bautagebuch: Export → Objekte, wiederholbar, nichts doppelt', async () => {
  const exp = { format: 1, tables: {
    contacts: [{ id: 1, name: 'Rohbau Schmitz GmbH', trade: 'Rohbau', phone: '0201 1', email: 'kaputt', art: '' }, { id: 2, name: 'Gerüstbau Ruhr', trade: 'Gerüst' }],
    projects: [{ id: 5, name: 'Haus A', client: 'Familie Muster', street: 'Musterweg 1', zip: '45127', city: 'Essen', folder: '2026-01 Haus A', archived: 0 }, { id: 6, name: 'Altprojekt', archived: 1 }],
    reports: [{ id: 10, project_id: 5, number: 3, date: '2026-04-15', time: '09:15', weather: 'Bedeckt', precip: 'leichter Regen', temp: '7.5', humidity: '81', wind: '12', site_manager: 'Unbekannt, leitung', chk_tidy: 1, chk_photos: 1 },
      { id: 11, project_id: 5, number: 4, date: '' }, { id: 12, project_id: 99, number: 1, date: '2026-01-01' }],
    items: [{ id: 100, report_id: 10, kind: 'anwesende', text: 'Rohbau Schmitz GmbH', contact_id: 1, activity: 'Schalung Decke', headcount: 4 },
      { id: 101, report_id: 10, kind: 'maengel', text: 'Riss in der Sohle', company: 'gerüstbau ruhr', due: '2026-05-01', done: 1 },
      { id: 102, report_id: 10, kind: 'weisungen', text: 'Gerüstlage 3 sichern', company: 'Fremdfirma Neu' }, { id: 103, report_id: 10, kind: 'material', text: 'gibt es nicht mehr' },
      { id: 104, report_id: 10, kind: 'anwesende', text: 'Elektro Unbekannt', activity: 'Leerrohre' }],
    images: [{ id: 7, report_id: 10, file: 'a1b2.jpg', caption: 'Sohle' }, { id: 8, report_id: 12, file: 'weg.jpg' }],
  } };
  const u = altdatenLesen(exp);
  assert.deepEqual([u.kontakte.length, u.projekte.length, u.berichte.length, u.eintraege.length, u.bilder.length], [2, 2, 1, 4, 1]);
  assert.deepEqual(u.berichte[0]!.werte, { nummer: 3, datum: '2026-04-15', uhrzeit: '09:15', titel: 'Tagesbericht 3', wetter: 'regen', temperatur: 7.5, luftfeuchte: 81, wind: 12, aufgeraeumt: true, masskontrolle: false, fotodoku: true, firmen_angesprochen: false });
  assert.deepEqual(u.eintraege.map((e) => [e.werte.art, e.werte.text, e.firma, e.werte.reihe]), [['anwesend', 'Schalung Decke', 'alt:kontakt:1', 1], ['mangel', 'Riss in der Sohle', 'alt:kontakt:2', 1], ['weisung', 'Gerüstlage 3 sichern (Fremdfirma Neu)', '', 1], ['anwesend', 'Elektro Unbekannt – Leerrohre', '', 2]]);
  assert.throws(() => altdatenLesen({ irgendwas: 1 }), Ablehnung);

  const { db, weg } = await frischeDb();
  try {
    const { admin, leitung } = await leute(db);
    const wer = { ...admin, anmeldename: 'admin', rolle: 'admin' };
    // Den Kontakt gibt es schon (anders geschrieben), das Projekt auch
    const schon = randomUUID();
    await tun(db, admin, { objekt: 'kontakt', art: 'anlegen', objektId: schon, werte: { name: 'rohbau schmitz gmbh', ort: 'Essen' } });
    let p = await altdatenPlanen(db, register, wer, u);
    assert.deepEqual([p.je.kontakt!.neu, p.je.kontakt!.geaendert, p.je.projekt!.neu, p.je.tagesbericht!.neu, p.je.bericht_eintrag!.neu], [1, 1, 2, 1, 4]);
    assert.ok(p.hinweise.some((h) => h.includes('1 Fotos')) && p.hinweise.some((h) => h.includes('ohne Datum')));
    await vorgangAusfuehren(db, register, wer, p.liste);
    const o = (await schnappschuss(db, register, admin)).objekte;
    const kontakt = o.kontakt!.find((x) => x.id === schon)!;
    assert.deepEqual([o.kontakt!.length, kontakt.werte.name, kontakt.werte.ort, kontakt.werte.gewerk, kontakt.werte.kennung], [2, 'rohbau schmitz gmbh', 'Essen', 'Rohbau', 'alt:kontakt:1'], 'vorhandener Kontakt wird weitergeführt; was von Hand dasteht, bleibt');
    const bericht = o.tagesbericht![0]!;
    assert.deepEqual([bericht.werte.bauleitung, bericht.herkunft?.wetter, o.projekt!.find((x) => x.id === bericht.werte.projekt)!.werte.ordner], [leitung.id, 'uebernahme', '2026-01 Haus A'], 'Bauleitung über den Namen gefunden');
    const mangel = o.bericht_eintrag!.find((x) => x.werte.art === 'mangel')!;
    assert.deepEqual([mangel.werte.erledigt, mangel.werte.frist, mangel.werte.bericht, o.kontakt!.find((x) => x.id === mangel.werte.firma)!.werte.name], [true, '2026-05-01', bericht.id, 'Gerüstbau Ruhr']);
    assert.equal((await altdatenPlanen(db, register, wer, u)).liste.length, 0, 'derselbe Export noch einmal: nichts zu tun');
    // Später: im alten Bautagebuch kam ein Eintrag dazu, im neuen wurde der Mangel von Hand umformuliert
    await tun(db, leitung, { objekt: 'bericht_eintrag', objektId: mangel.id, werte: { text: 'Riss in der Sohle, Achse B' } });
    exp.tables.items.push({ id: 105, report_id: 10, kind: 'notizen', text: 'Nachgereicht' });
    p = await altdatenPlanen(db, register, wer, altdatenLesen(exp));
    assert.deepEqual(p.je.bericht_eintrag, { neu: 1, geaendert: 0, entfernt: 0, unveraendert: 4, behalten: 1 });

    // Direkt vom alten Bautagebuch: anmelden, Export holen, Fotos samt Vorschaubild nachholen
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500, 3)]);
    const alt = createServer((req, res) => {
      if (req.url === '/bautagebuch/api/login') {
        let body = ''; req.on('data', (d) => (body += d)); req.on('end', () => {
          const d = JSON.parse(body) as { name: string; password: string };
          if (d.name !== 'chef' || d.password !== 'geheim') { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Name oder Kennwort ist falsch.' })); return; }
          res.writeHead(200, { 'set-cookie': ['session=abc; Path=/; HttpOnly', 'bp_sso=xyz; Path=/'] }); res.end('{"ok":true}');
        }); return;
      }
      if (req.headers.cookie !== 'session=abc; bp_sso=xyz') { res.writeHead(401); res.end(); return; }
      if (req.url === '/bautagebuch/api/export') { res.end(JSON.stringify(exp)); return; }
      if (req.url === '/bautagebuch/uploads/a1b2.jpg' || req.url === '/bautagebuch/api/thumb/240/a1b2.jpg') { res.writeHead(200, { 'content-type': 'image/jpeg' }); res.end(jpeg); return; }
      res.writeHead(404); res.end();
    });
    await new Promise<void>((r) => alt.listen(0, '127.0.0.1', r));
    try {
      const adresse = `http://127.0.0.1:${(alt.address() as { port: number }).port}/bautagebuch/`;
      await assert.rejects(altAnmelden(adresse, 'chef', 'falsch'), /Anmeldung am alten Bautagebuch abgelehnt: Name oder Kennwort ist falsch/);
      await assert.rejects(altAnmelden('ftp://x', 'chef', 'geheim'), /https/);
      const quelle = await altAnmelden(adresse, 'chef', 'geheim');
      assert.equal(altdatenLesen(JSON.parse((await quelle.holen('api/export')).toString())).bilder.length, 1);
      for (const b of u.bilder) await db.query('insert into kern_altbild (datei, bericht, beschriftung, reihe) values ($1,$2,$3,$4)', [b.datei, b.bericht, b.beschriftung, b.reihe]);
      const stand = { n: 0, von: 0, fehler: [] as string[] };
      await altFotosHolen(db, register, 'test', wer, quelle, stand, () => undefined);
      assert.deepEqual([stand.n, stand.von, stand.fehler], [1, 1, []]);
      const foto = (await schnappschuss(db, register, admin)).objekte.foto!;
      assert.deepEqual(foto.map((f) => [f.werte.beschriftung, f.werte.kennung, f.herkunft?.name]), [['Sohle', 'alt:bild:a1b2.jpg', 'uebernahme']]);
      await altFotosHolen(db, register, 'test', wer, quelle, stand, () => undefined);
      assert.equal((await schnappschuss(db, register, admin)).objekte.foto!.length, 1, 'noch einmal: nichts doppelt');
    } finally { alt.close(); }
  } finally { await weg(); }
});

test('Geheimnisse: verschlüsselt in der Datenbank, lesbar nur mit dem Schlüssel aus dem Daten-Volume', async () => {
  const { db, weg } = await frischeDb();
  try {
    await geheimnisSetzen(db, 'ablage.kennwort', 'Sehr Geheim! äöü');
    const roh = (await db.query("select wert from kern_geheimnis where name = 'ablage.kennwort'")).rows[0].wert as string;
    assert.ok(!roh.includes('Geheim') && !Buffer.from(roh, 'base64').toString('latin1').includes('Geheim'));
    assert.equal(await geheimnisLesen(db, 'ablage.kennwort'), 'Sehr Geheim! äöü');
    await geheimnisSetzen(db, 'ablage.kennwort', 'neu');
    assert.equal(await geheimnisLesen(db, 'ablage.kennwort'), 'neu');
    assert.equal(await geheimnisLesen(db, 'gibtsnicht'), null);
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
    assert.deepEqual(z.module.map((m: any) => m.id), ['adressen', 'projekte', 'gebaeudemodell', 'dateien', 'bautagebuch', 'bauzeitenplan', 'kataloge', 'verwaltung']);
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

test('Gebäudemodell: Kostengruppe aus Art, Lage, Tragfähigkeit; U-Wert eines Aufbaus', () => {
  assert.deepEqual([['aussenwand', 'aussen', 'ja'], ['aussenwand', 'aussen', 'nein'], ['aussenwand', 'aussen', ''], ['innenwand', 'innen', 'ja'], ['fenster', 'innen', ''], ['dach', 'aussen', ''], ['bodenplatte', 'aussen', ''], ['sonstiges', '', '']]
    .map(([a, l, t]) => kostengruppeNummer(a, l, t)), ['331', '332', '330', '341', '344', '361', '322', null]);
  assert.equal(uWert('aussenwand', [{ dicke: 36.5, lambda: 0.08 }]), 0.21);   // 1 / (0,13 + 4,5625 + 0,04)
  assert.equal(uWert('aussenwand', [{ dicke: 36.5, lambda: 0.08 }, { dicke: 1.5, lambda: null }]), null, 'ohne λ kein Wert');
});

test('Bauzeitenplan: Plan der Gantt-App in eine Version übernehmen, wiederholbar, Hand-Änderungen bleiben', async () => {
  const { altplanLesen } = await import('../src/module/bauzeitenplan/austausch');
  const { planUebernehmen, planLaden } = await import('../src/server/bauzeitenplan');
  const { db, weg } = await frischeDb();
  try {
    const { leitung } = await leute(db);
    const wer = { ...leitung, anmeldename: 'leitung', rolle: 'bueroleitung' };
    const [p, v] = [randomUUID(), randomUUID()];
    await tun(db, leitung, { objekt: 'projekt', art: 'anlegen', objektId: p, werte: { name: 'Haus A' } });
    await tun(db, leitung, { objekt: 'version', art: 'anlegen', objektId: v, werte: { projekt: p, bereich: 'bauzeitenplan', name: 'Start' } });
    const alt = { name: 'Haus A', startDate: '2026-11-16', cal: { week: 5 }, tasks: [{ uid: 1, name: 'Mauern', lvl: 0, dur: 10 }, { uid: 2, name: 'Decke', lvl: 0, dur: 5, preds: [{ uid: 1, type: 'FS', lag: 0 }] }] };
    const plane = () => alsBenutzer(db, wer, (c) => planUebernehmen(c, register, { projekt: p, version: v }, altplanLesen(alt, 'alt-gantt:7:'), 'alt-gantt:7:'));
    const a = await plane();
    assert.deepEqual([a.je.zeitplan!.neu, a.je.vorgang!.neu, a.je.verknuepfung!.neu], [1, 2, 1]);
    await vorgangAusfuehren(db, register, wer, a.liste);
    assert.equal((await plane()).liste.length, 0, 'derselbe Plan noch einmal: nichts zu tun');
    const l = await planLaden(db, register, wer, v);
    assert.deepEqual(l.plan.zeilen.map((z) => [z.name, z.termin.anfang, z.termin.ende, z.vorg]), [['Mauern', '2026-11-16', '2026-11-27', ''], ['Decke', '2026-11-30', '2026-12-04', '1']]);
    // von Hand: Dauer der Decke geändert; neuer Stand der Gantt-App ändert sie auch – die Hand-Änderung bleibt
    const decke = l.plan.reihe.find((x) => x.werte.name === 'Decke')!;
    await tun(db, leitung, { objekt: 'vorgang', objektId: decke.id, werte: { dauer: 6 } });
    alt.tasks[1]!.dur = 8;
    const b = await plane();
    assert.deepEqual(b.je.vorgang, { neu: 0, geaendert: 0, entfernt: 0, unveraendert: 2, behalten: 1 });
  } finally { await weg(); }
});
