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
import { versionKopieren, versionsregelnAnmelden } from '../src/server/versionen';
import { geheimnisLesen, geheimnisSetzen } from '../src/server/ablage';
import { planen } from '../src/server/ifc';
import { planeSchaetzung } from '../src/server/assistent';
import { seiteBauen } from '../src/server/druck';
import { schaetzen } from '../src/module/gebaeudemodell/schaetzung';
import { gebaeude as gebaeudeModell } from '../src/module/gebaeudemodell/beipackzettel';
import { vorgangAusfuehren } from '../src/server/protokoll';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATEN_PFAD = mkdtempSync(path.join(tmpdir(), 'bp-daten-'));

versionsregelnAnmelden(register);

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
    const vorgang = (version: string, name: string, projekt = p1) => tun(db, leitung, { objekt: 'vorgang', art: 'anlegen', werte: { projekt, version, name, beginn: '2026-12-01', ende: '2026-12-12' } });
    await vorgang(vA, 'Rohbau'); await vorgang(vA, 'Dach');
    await assert.rejects(vorgang(randomUUID(), 'ohne Version'), Ablehnung);
    await assert.rejects(vorgang(vA, 'falsches Projekt', p2), Ablehnung);
    await assert.rejects(tun(db, leitung, { objekt: 'vorgang', art: 'anlegen', werte: { projekt: p1, version: vA, name: 'x', beginn: '2026-02-30' } }), Eingabefehler, 'kein gültiges Datum');
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
    await tun(db, leitung, { objekt: 'bauteil', objektId: w, herkunft: 'geschaetzt', werte: { aufbau: 'Mauerwerk 36,5' } });
    const v3 = randomUUID();
    await versionKopieren(db, register, leitung, { vorgang: randomUUID(), quelle: v, projekt: p, name: 'Stand 3', versionId: v3 });
    o = await lies();
    assert.deepEqual(o.bauteil!.find((x) => x.werte.version === v3)!.herkunft, { aufbau: 'geschaetzt' }, 'die Herkunft wandert in die Kopie mit');
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
    const wand = (kennung: string, name: string, menge: number, geschoss = 'eg') => ({ kennung, art: 'aussenwand', name, geschoss, lage: 'aussen', menge, einheit: 'm2', abmessung: '', aufbau: 'Mauerwerk 36,5 cm' });
    const plan1 = { schema: 'IFC4', uebersprungen: {}, flaechen_aus_geometrie: 0,
      gebaeude: [{ kennung: 'haus', name: 'Wohnhaus' }],
      geschosse: [{ kennung: 'eg', name: 'EG', ebene: 0, hoehe: 2.85, gebaeude: 'haus' }, { kennung: 'og', name: 'OG', ebene: 1, hoehe: null, gebaeude: 'haus' }],
      raeume: [{ kennung: 'r1', nummer: '0.01', name: 'Wohnen', nutzung: '', flaeche: 28.4, hoehe: null, geschoss: 'eg' }, { kennung: 'r2', nummer: 'x', name: 'ohne Geschoss', nutzung: '', flaeche: 1, hoehe: null, geschoss: null }],
      bauteile: [wand('w1', 'Außenwand Nord', 22), wand('w2', 'Außenwand Süd', 22), wand('w3', 'Außenwand OG', 16.5, 'og')] };
    const a = await planen(db, register, wer, p, v, plan1);
    assert.deepEqual([a.je.gebaeude!.neu, a.je.geschoss!.neu, a.je.raum!.neu, a.je.bauteil!.neu, a.ohneGeschoss], [1, 2, 1, 3, 1]);
    await vorgangAusfuehren(db, register, wer, a.liste);
    const lies = async () => (await schnappschuss(db, register, leitung)).objekte;
    let o = await lies();
    const w1 = o.bauteil!.find((x) => x.werte.kennung === 'w1')!;
    assert.equal(w1.werte.geschoss, o.geschoss!.find((x) => x.werte.kennung === 'eg')!.id);
    assert.equal(w1.herkunft!.menge, 'ifc');
    assert.equal((await planen(db, register, wer, p, v, plan1)).befehle, 0, 'derselbe Plan noch einmal: nichts zu tun');

    // Von Hand: Menge von w1 korrigiert, eigenes Bauteil ohne Plan angelegt
    await tun(db, leitung, { objekt: 'bauteil', objektId: w1.id, werte: { menge: 23.5 } });
    await tun(db, leitung, { objekt: 'bauteil', art: 'anlegen', werte: { projekt: p, version: v, name: 'Vordach (von Hand)', art: 'sonstiges' } });
    // Neuer Planstand: w1 und w2 mit anderer Menge, w3 entfällt, w4 neu
    const plan2 = { ...plan1, bauteile: [wand('w1', 'Außenwand Nord', 25), wand('w2', 'Außenwand Süd', 24), wand('w4', 'Außenwand West', 30)] };
    const b = await planen(db, register, wer, p, v, plan2);
    assert.deepEqual(b.je.bauteil, { neu: 1, geaendert: 1, entfernt: 1, unveraendert: 1, behalten: 1 });
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
    assert.equal(o.bauteil!.filter((x) => !x.geloescht).length, 4);
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
      bauteile: [{ kennung: 'w1', art: 'aussenwand', name: 'Außenwand Nord', geschoss: 'eg', lage: 'aussen', menge: 22, einheit: 'm2', abmessung: '', aufbau: '' }] };
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
    await tun(db, leitung, { objekt: 'tagesbericht', art: 'anlegen', objektId: b, werte: { projekt: p, nummer: 7, datum: '2026-11-24', titel: 'Bodenplatte', wetter: 'regen', temperatur: 4.5, leistungen: 'Bewehrung verlegt\n<b>fett?</b>' } });
    const A = 'bautagebuch.tagesbericht';
    let s = await seiteBauen(db, register, als(leitung, 'bueroleitung'), A, b);
    assert.equal(s.name, 'Tagesbericht 7 24.11.2026 Haus -A- & Söhne.pdf');
    for (const t of ['<h1 data-stelle="titel.text">Tagesbericht Nr. 7</h1>', '24.11.2026 · Bodenplatte', '<dt>Wetter</dt><dd>Regen</dd>', '<dd>4,5</dd>', 'Haus &lt;A&gt; &amp; Söhne', '45127 Essen', '&lt;b&gt;fett?&lt;/b&gt;', 'GK3 · Tagesbericht Nr. 7 vom 24.11.2026', 'counter(pages)']) assert.ok(s.html.includes(t), t);
    assert.ok(!s.html.includes('Mängel und Behinderungen'), 'leere Abschnitte fallen weg');
    // Das Büro stellt ein: andere Überschrift, Temperatur aus, Mängel auch leer zeigen, kleine Schrift
    for (const [stelle, wert] of [['titel.text', 'Bautagesbericht {nummer}'], ['angaben.temperatur.aus', 'ja'], ['maengel.leer', 'ja'], ['angaben.wetter.titel', 'Witterung'], ['seite.schrift', 'klein']] as [string, string][]) {
      await tun(db, leitung, { objekt: 'druckeinstellung', art: 'anlegen', werte: { ausdruck: A, stelle, wert } });
    }
    await tun(db, leitung, { objekt: 'projekt_mitglied', art: 'anlegen', werte: { projekt: p, benutzer: mit.id } });
    s = await seiteBauen(db, register, als(mit, 'mitarbeiter'), A, b);
    for (const t of ['>Bautagesbericht 7</h1>', '<dt>Witterung</dt>', 'Mängel und Behinderungen', 'font: 9pt']) assert.ok(s.html.includes(t), t);
    assert.ok(!s.html.includes('Temperatur'));
    await assert.rejects(tun(db, mit, { objekt: 'druckeinstellung', art: 'anlegen', werte: { ausdruck: A, stelle: 'kopf.aus', wert: 'ja' } }), Ablehnung, 'das Layout des Büros ändert nur, wer es darf');
    await assert.rejects(seiteBauen(db, register, als(gast, 'gast'), A, b), Ablehnung, 'kein Mitglied des Projekts: kein Ausdruck');
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
    assert.deepEqual(z.module.map((m: any) => m.id), ['adressen', 'projekte', 'gebaeudemodell', 'dateien', 'bautagebuch', 'bauzeitenplan', 'verwaltung']);
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
