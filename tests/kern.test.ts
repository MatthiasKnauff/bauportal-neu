// Tests gegen eine echte Datenbank: Kern, Protokoll, Rechte, Versionen, Übernahme (IFC, Assistent, Kataloge),
// Druckwerk, KI, Wetter, Fotos und der Server als Ganzes. Ohne grüne Tests baut die Pipeline kein Image.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { register } from '../src/module';
import { kontakt } from '../src/module/adressen/beipackzettel';
import { Eingabefehler, mengenSumme, pruefeWerte } from '../src/kern/modell';
import { sammelfilter } from '../src/kern/modul';
import { bauteil } from '../src/module/gebaeudemodell/beipackzettel';
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
  assert.throws(() => pruefeWerte(kontakt, { anrede: 'gibtsnicht' }, false), Eingabefehler);
  assert.deepEqual(pruefeWerte(kontakt, { art: '  Planer:in ' }, false), { art: 'Planer:in' }, 'eigene Kontaktart');
  assert.throws(() => pruefeWerte(kontakt, { unbekannt: 'x' }, false), Eingabefehler);
  assert.deepEqual(pruefeWerte(kontakt, { ort: 'Essen' }, false), { ort: 'Essen' });
});

test('Summe der Menge je Einheit, Sammelfilter aus dem Modell', () => {
  const menge = bauteil.felder.find((f) => f.name === 'menge')!;
  assert.deepEqual(mengenSumme([{ menge: 8.13, einheit: 'm2' }, { menge: 3.02, einheit: 'm2' }, { menge: null, einheit: 'm2' }], menge), [{ einheit: 'm2', summe: 11.15, anzahl: 2 }]);
  assert.equal(mengenSumme([{ menge: 1, einheit: 'm2' }, { menge: 2, einheit: 'stk' }], menge).length, 2);
  const f = sammelfilter(bauteil, ['art', 'geschoss']).map((x) => x.feld);
  assert.ok(f.includes('lage') && !f.includes('art') && !f.includes('projekt') && !f.includes('version') && !f.includes('name'));
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
    // die einzige Version eines Projekts lässt sich löschen – das Projekt hat den Bauzeitenplan dann nicht mehr
    await tun(db, leitung, { objekt: 'version', art: 'loeschen', objektId: vD });
    assert.deepEqual(await gueltig(), ['Test 2'], 'die letzte (gültige) Version ist gelöscht');
    await tun(db, leitung, { objekt: 'version', art: 'wiederherstellen', objektId: vD });
    assert.deepEqual(await gueltig(), ['Test 2', 'aus Haus A'], '„Zurück“ holt die gültige wieder');
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
    for (const t of ['<h1 data-stelle="titel.text">Tagesbericht Nr. 7</h1>', '24.11.2026<', '<dt>Wetter</dt><dd>Regen</dd>', '<dd>4,5</dd>', '<dt>Bauleitung</dt><dd>leitung</dd>', '<dt>Baustelle aufgeräumt</dt><dd>Ja</dd>', '<dt>Maßkontrolle</dt><dd>Nein</dd>',
      'Haus &lt;A&gt; &amp; Söhne', '45127 Essen', '&lt;b&gt;fett?&lt;/b&gt;', 'GK3 · Tagesbericht Nr. 7 vom 24.11.2026', 'counter(pages)', '<h2>Mängel</h2>', '<h2>Anwesende</h2>', 'Rohbau Schmitz GmbH</td>', '01.12.2026', '>✓</td>']) assert.ok(s.html.includes(t), t);
    assert.ok(s.html.indexOf('Abstandhalter fehlen') < s.html.indexOf('Riss in der Sohle'), 'Einträge stehen in der Reihenfolge des Berichts');
    assert.ok(!s.html.includes('<h2>Weisungen</h2>'), 'leere Abschnitte fallen weg');
    // Büro-Logo im Briefkopf: im PDF als Bild selbst (der Druckdienst holt keine Adressen)
    assert.ok(!s.html.includes('class="logo"'), 'ohne Logo kein Bild');
    await db.query('insert into kern_logo (id, bild) values (1, $1)', [Buffer.from('89504e470d0a1a0a00', 'hex')]);
    s = await seiteBauen(db, register, als(leitung, 'bueroleitung'), A, b);
    assert.ok(s.html.includes('<img class="logo" src="data:image/png;base64,'), 'Logo im Briefkopf');
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

test('Aufbau: jede Datei ist ein Baustein mit Beschreibung, die Prüfregeln finden keinen Fehler', async () => {
  const { pruefen, umfeld, codeNetz, datenNetz } = await import('../src/kern/aufbaunetz');
  const q = aufbauLesen() as import('../src/kern/aufbaunetz').Quelltext;
  const d = q.bausteine.find((b) => b.pfad === 'src/server/druck.ts')!;
  assert.ok(d.bereich === 'server' && d.bindetEin.includes('src/kern/druck.ts') && d.stelltBereit.includes('seiteBauen'));
  // Die Prüfregeln (Schichten, Verweise, Beschreibung …) sind eine feste Grenze: kein Befund der Stufe „fehler“
  assert.deepEqual(pruefen(q, register.module).filter((b) => b.stufe === 'fehler').map((b) => `${b.baustein}: ${b.text}`), []);
  // Fremde Schicht wird erkannt
  const kaputt = { ...q, bausteine: q.bausteine.map((b) => (b.pfad === 'src/kern/modell.ts' ? { ...b, bindetEin: [...b.bindetEin, 'src/server/db.ts'] } : b)) };
  assert.ok(pruefen(kaputt, register.module).some((b) => b.regel === 'schicht' && b.baustein === 'src/kern/modell.ts'));
  // Umfeld: links, wer auf den Bericht verweist, rechts, worauf er verweist; Stufe 2 schließt an
  const u = umfeld(datenNetz(register.module), 'tagesbericht', 2);
  assert.deepEqual(u.map((s) => s.seite), ['herkunft', 'herkunft', 'mitte', 'ziel', 'ziel']);
  assert.ok(u[1]!.ids.includes('bericht_eintrag') && u[3]!.ids.includes('projekt') && !u[3]!.ids.includes('tagesbericht'));
  const c = umfeld(codeNetz(q), 'src/kern/modell.ts', 1);
  assert.ok(c[0]!.ids.length > 10 && c[2]!.ids.length === 0, 'modell.ts wird viel gebraucht und bindet nichts ein');
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
    assert.deepEqual(z.module.map((m: any) => m.id), ['adressen', 'projekte', 'gebaeudemodell', 'dateien', 'bautagebuch', 'bauzeitenplan', 'ava', 'kataloge', 'verwaltung']);
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

test('Adressen aufräumen: Doppelte finden, zusammenführen, Verweise wandern mit, Beteiligte nur einmal', async () => {
  const { nameSchluessel, doppelteFinden } = await import('../src/server/adressen');
  assert.equal(nameSchluessel('Müller Bau GmbH & Co. KG'), nameSchluessel('mueller bau'));
  assert.deepEqual(doppelteFinden([
    { id: 'a', werte: { name: 'Müller Bau GmbH' } }, { id: 'b', werte: { name: 'Mueller Bau' } },
    { id: 'c', werte: { name: 'Schmidt', telefon: '0201 123456' } }, { id: 'd', werte: { name: 'Elektro Schmidt', telefon: '+49 201 123456' } },
    { id: 'e', werte: { name: 'Einzeln' } },
  ]).map((g) => g.ids), [['a', 'b'], ['c', 'd']]);
  const { db, weg } = await frischeDb();
  const app = await baueServer({ db, register, version: 'v-test', umgebung: 'test' });
  try {
    const adresse = await app.listen({ host: '127.0.0.1', port: 0 });
    const ruf = async (pfad: string, o: { body?: unknown; cookie?: string } = {}) => {
      const r = await fetch(adresse + pfad, { method: o.body ? 'POST' : 'GET', headers: { ...(o.body ? { 'content-type': 'application/json' } : {}), ...(o.cookie ? { cookie: o.cookie } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
      return { status: r.status, daten: await r.json() as any, cookie: r.headers.get('set-cookie')?.split(';')[0] };
    };
    await ruf('/api/einrichtung', { body: { name: 'Matthias', anmeldename: 'mk', kennwort: 'ein-langes-kennwort', bueroname: 'GK3', musterprojekt: true } });
    const cookie = (await ruf('/api/anmelden', { body: { anmeldename: 'mk', kennwort: 'ein-langes-kennwort' } })).cookie!;
    const p = (await ruf('/api/schnappschuss', { cookie })).daten.objekte.projekt[0].id as string;
    const [k1, k2] = [randomUUID(), randomUUID()];
    const [b1, b2, bericht, e1] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const befehle = [
      bef({ art: 'anlegen', objektId: k1, werte: { name: 'Dachbau Krause GmbH', telefon: '0201 55555' } }),
      bef({ art: 'anlegen', objektId: k2, werte: { name: 'dachbau krause', email: 'info@krause.de', notiz: 'Chef: Herr Krause' } }),
      bef({ objekt: 'projekt_kontakt', art: 'anlegen', objektId: b1, werte: { projekt: p, kontakt: k1, aufgabe: 'Dach' } }),
      bef({ objekt: 'projekt_kontakt', art: 'anlegen', objektId: b2, werte: { projekt: p, kontakt: k2, aufgabe: 'Dach' } }),
      bef({ objekt: 'tagesbericht', art: 'anlegen', objektId: bericht, werte: { projekt: p, datum: '2026-11-25', titel: 'Dach' } }),
      bef({ objekt: 'bericht_eintrag', art: 'anlegen', objektId: e1, werte: { projekt: p, bericht, art: 'mangel', text: 'Ortgang', firma: k2 } }),
    ];
    const r0 = await ruf('/api/befehle', { cookie, body: { befehle } });
    assert.ok(r0.daten.ergebnis.every((e: any) => e.seq), JSON.stringify(r0.daten));
    const gruppen = (await ruf('/api/adressen/doppelte', { cookie })).daten;
    assert.deepEqual(gruppen.map((g: any) => g.ids.sort()), [[k1, k2].sort()]);
    const v = (await ruf('/api/adressen/zusammenfuehren', { cookie, body: { gruppen: [{ behalten: k1, weg: [k2] }] } })).daten;
    assert.equal(v.je.Kontakte.entfernt, 1);
    assert.equal((await ruf('/api/uebernehmen', { cookie, body: { token: v.token } })).status, 200);
    const s = (await ruf('/api/schnappschuss', { cookie })).daten.objekte;
    const k = s.kontakt.find((x: any) => x.id === k1);
    assert.equal(k.werte.email, 'info@krause.de', 'leere Angabe ergänzt');
    assert.equal(k.werte.telefon, '0201 55555');
    assert.ok(s.kontakt.find((x: any) => x.id === k2)?.geloescht ?? true, 'Doppelter entfernt');
    assert.equal(s.bericht_eintrag.find((x: any) => x.id === e1).werte.firma, k1, 'Mangel zeigt auf den behaltenen');
    assert.deepEqual(s.projekt_kontakt.filter((x: any) => !x.geloescht && x.werte.projekt === p && x.werte.kontakt === k1).map((x: any) => x.id), [b1], 'Beteiligt nur einmal');
    assert.equal((await ruf('/api/adressen/doppelte', { cookie })).daten.length, 0);
  } finally { await app.close(); await weg(); }
});

test('Prüf-KI: nur mit Schlüssel, nur lesen, Ratschläge landen in der Verwaltung, Ausschalten sperrt', async () => {
  const { db, weg } = await frischeDb();
  const app = await baueServer({ db, register, version: 'v-test', umgebung: 'test' });
  try {
    const adresse = await app.listen({ host: '127.0.0.1', port: 0 });
    const ruf = async (pfad: string, o: { body?: unknown; cookie?: string; schluessel?: string } = {}) => {
      const r = await fetch(adresse + pfad, { method: o.body ? 'POST' : 'GET', headers: { ...(o.body ? { 'content-type': 'application/json' } : {}), ...(o.cookie ? { cookie: o.cookie } : {}), ...(o.schluessel ? { authorization: `Bearer ${o.schluessel}` } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
      const t = await r.text();
      let daten: any = t; try { daten = JSON.parse(t); } catch { /* Text */ }
      return { status: r.status, daten, cookie: r.headers.get('set-cookie')?.split(';')[0] };
    };
    await ruf('/api/einrichtung', { body: { name: 'Matthias', anmeldename: 'mk', kennwort: 'ein-langes-kennwort', bueroname: 'GK3', musterprojekt: true } });
    const cookie = (await ruf('/api/anmelden', { body: { anmeldename: 'mk', kennwort: 'ein-langes-kennwort' } })).cookie!;
    const z = randomUUID();
    await ruf('/api/befehle', { cookie, body: { befehle: [bef({ objekt: 'pruefzugang', art: 'anlegen', objektId: z, werte: { name: 'Prüf-KI', aktiv: true } })] } });
    const schluessel = (await ruf('/api/pruefer/schluessel', { cookie, body: { zugang: z } })).daten.schluessel as string;
    assert.match(schluessel, /^bpp_/);
    assert.equal((await ruf('/api/pruefer')).status, 401, 'ohne Schlüssel nichts');
    assert.equal((await ruf('/api/pruefer', { schluessel: schluessel.slice(0, -2) + 'xx' })).status, 401, 'falscher Schlüssel');
    const start = await ruf('/api/pruefer', { schluessel });
    assert.equal(start.status, 200);
    assert.ok(start.daten.wege['POST /api/pruefer/ratschlag'] && start.daten.regeln.schicht);
    assert.ok((await ruf('/api/pruefer/aufbau', { schluessel })).daten.includes('# Bauportal – Aufbau'));
    const u = (await ruf('/api/pruefer/umfeld?sicht=daten&wahl=bericht_eintrag&tiefe=1', { schluessel })).daten;
    assert.ok(u.spalten[2].ids.includes('kontakt'), 'Ziel des Eintrags: Kontakt');
    assert.ok(Array.isArray((await ruf('/api/pruefer/pruefung', { schluessel })).daten.befunde));
    assert.ok((await ruf('/api/pruefer/betrieb', { schluessel })).daten.tabellen.includes('o_kontakt'));
    // Projektdaten und Befehle gibt es mit dem Schlüssel nicht
    assert.equal((await ruf('/api/schnappschuss', { schluessel })).status, 401);
    assert.equal((await ruf('/api/befehle', { schluessel, body: { befehle: [] } })).status, 401);
    // Ratschlag schicken, in der Verwaltung sehen, Antwort zurücklesen
    const r = await ruf('/api/pruefer/ratschlag', { schluessel, body: { titel: 'abgleich.ts in einen Ordner „Unterbau“', text: 'Dann braucht die Schichtregel keine Ausnahme.', baustein: 'src/ui/abgleich.ts', regel: 'schicht' } });
    assert.equal(r.status, 200, JSON.stringify(r.daten));
    const s = (await ruf('/api/schnappschuss', { cookie })).daten.objekte.pruefrat;
    assert.equal(s[0].werte.stand, 'offen');
    assert.equal(s[0].werte.zugang, z);
    await ruf('/api/befehle', { cookie, body: { befehle: [bef({ objekt: 'pruefrat', objektId: r.daten.id, werte: { stand: 'angenommen', antwort: 'Machen wir.' } })] } });
    const liste = (await ruf('/api/pruefer/ratschlaege', { schluessel })).daten;
    assert.deepEqual([liste[0].stand, liste[0].antwort], ['angenommen', 'Machen wir.']);
    // Ausschalten sperrt sofort
    await ruf('/api/befehle', { cookie, body: { befehle: [bef({ objekt: 'pruefzugang', objektId: z, werte: { aktiv: false } })] } });
    assert.equal((await ruf('/api/pruefer', { schluessel })).status, 401);
  } finally { await app.close(); await weg(); }
});

test('Name eines Eintrags: Anzeigefeld, sonst Ersatzname (Tagesbericht ohne Kurzbeschreibung)', async () => {
  const { benennen } = await import('../src/kern/druck');
  const { tagesbericht } = await import('../src/module/bautagebuch/beipackzettel');
  const ohne = (z: string, id: string) => `${z}:${id}`;
  // die Kurzbeschreibung braucht der Tagesbericht nicht (26.11.2026): verborgen – auch alte Einträge heißen Nr. und Datum
  assert.equal(benennen(tagesbericht, { titel: 'Bodenplatte', nummer: 3, datum: '2026-11-25' }, ohne), 'Nr. 3 · 25.11.2026');
  assert.equal(benennen(tagesbericht, { titel: null, nummer: 3, datum: '2026-11-25' }, ohne), 'Nr. 3 · 25.11.2026');
  assert.ok(tagesbericht.felder.find((f) => f.name === 'titel')!.verborgen, 'Kurzbeschreibung steht nirgends');
});

test('Eigene Einträge: Projekt-Merker sieht und ändert nur, wem sie gehören', async () => {
  const { db, weg } = await frischeDb();
  try {
    const { leitung, bau } = await leute(db);
    const p = randomUUID();
    await tun(db, leitung, { objekt: 'projekt', art: 'anlegen', objektId: p, werte: { name: 'Haus A' } });
    await tun(db, leitung, { objekt: 'projekt_mitglied', art: 'anlegen', objektId: randomUUID(), werte: { projekt: p, benutzer: bau.id } });
    await tun(db, leitung, { objekt: 'projekt_merker', art: 'anlegen', objektId: randomUUID(), werte: { projekt: p, benutzer: leitung.id, favorit: true } });
    const sieht = async (wer: Absender) => (await schnappschuss(db, register, wer)).objekte.projekt_merker?.length ?? 0;
    assert.equal(await sieht(leitung), 1, 'sieht den eigenen Favoriten');
    assert.equal(await sieht(bau), 0, 'die anderen sehen ihn nicht');
    assert.equal((await befehleSeit(db, bau, 0)).filter((b) => b.objekt === 'projekt_merker').length, 0, 'auch nicht im Protokoll');
    await assert.rejects(tun(db, bau, { objekt: 'projekt_merker', art: 'anlegen', objektId: randomUUID(), werte: { projekt: p, benutzer: leitung.id, favorit: true } }), /Recht/, 'keine Merker für andere');
    await tun(db, bau, { objekt: 'projekt_merker', art: 'anlegen', objektId: randomUUID(), werte: { projekt: p, benutzer: bau.id, zuletzt: '2026-11-25T12:00:00Z' } });
    assert.equal(await sieht(bau), 1);
  } finally { await weg(); }
});

test('Design: Theme im shadcn-Format wird übersetzt, Gefährliches bleibt draußen', async () => {
  const { themeLesen, schriften, satzFuer } = await import('../src/kern/design');
  const d = themeLesen(`:root { --background: oklch(0.98 0 0); --primary: #e11d48; --radius: 1rem; --font-sans: "Space Grotesk", sans-serif; --card: 0 0% 100%; --muted: url(javascript:alert(1)); }
    .dark { --background: #111; --primary: #fb7185; }`);
  assert.equal(d.hell.grund, 'oklch(0.98 0 0)');
  assert.equal(d.hell.akzent, '#e11d48');
  assert.equal(d.hell.rund, '2', '1rem = doppelt so rund wie Standard');
  assert.equal(d.hell.flaeche, 'hsl(0 0% 100%)', 'ältere shadcn-Werte bekommen hsl()');
  assert.equal(d.hell.still, undefined, 'url(…) wird nicht übernommen');
  assert.equal(d.dunkel.akzent, '#fb7185');
  assert.deepEqual(schriften(d), ['Space Grotesk']);
  assert.equal(satzFuer(d, true, 0).rund, '0', 'eigene Rundung gewinnt');
  assert.throws(() => themeLesen('nur Text'));
});

test('Kostenrahmen: passende NHK-Zeile, Hochrechnung mit dem Baupreisindex, Grenzen', async () => {
  const { kostenrahmen, nhkNummer } = await import('../src/module/gebaeudemodell/kosten');
  const kw = [{ nummer: '1.11', gebaeudeart: 'freistehendes EFH', ausfuehrung: 'KG+EG+OG; DG ausgebaut', stufen: [655, 725, 835, 1005, 1260], kostenstand: 2010, index: 'wohn' },
    { nummer: '4.2', gebaeudeart: 'MFH 7–20 WE', ausfuehrung: '', stufen: [null, null, 765, 915, 1105], kostenstand: 2010, index: 'wohn' }];
  const ix = [{ jahr: 2010, quartal: '', wohn: 70.8, buero: 70.2, gewerbe: 70 }, { jahr: 2026, quartal: 'II', wohn: 140.3, buero: 142.7, gewerbe: 141.4 }, { jahr: 2026, quartal: 'III', wohn: 141.7, buero: 144.2, gewerbe: 142.9 }];
  assert.equal(nhkNummer({ nutzung: 'efh', keller: 'wu', geschosszahl: 2, dach_oben: 'ausgebaut' }), '1.11');
  assert.equal(nhkNummer({ nutzung: 'efh', keller: 'ohne', geschosszahl: 1, dach_oben: 'nichts' }), '1.23');
  assert.equal(nhkNummer({ nutzung: 'mfh', einheiten: 12 }), '4.2');
  const r = kostenrahmen({ nutzung: 'efh', massnahme: 'neubau', keller: 'wu', geschosszahl: 2, dach_oben: 'ausgebaut' }, 200, kw, ix);
  assert.ok('von' in r);
  assert.equal(r.von, Math.round(835 * 141.7 / 70.8));   // Beispiel aus der Hilfe: ≈ 1.671 €/m²
  assert.equal(r.stand, '3. Quartal 2026');
  assert.equal(r.summeVon, Math.round(r.von * 200 / 1000) * 1000);
  assert.ok('fehlt' in kostenrahmen({ nutzung: 'efh', massnahme: 'kernsanierung' }, 200, kw, ix), 'nur für Neubau');
  assert.ok('fehlt' in kostenrahmen({ nutzung: 'efh' }, 0, kw, ix), 'ohne BGF kein Rahmen');
  assert.ok('fehlt' in kostenrahmen({ nutzung: 'efh' }, 200, kw, ix.slice(1)), 'ohne Index 2010 kein Rahmen');
});

test('Nachschlagen: Suche nach Nummer oder Wortanfängen, Beipackzettel geprüft', async () => {
  const { suchbedingung } = await import('../src/server/nachschlagen');
  assert.deepEqual(suchbedingung('012.02'), { art: 'code', wert: '012.02' });
  assert.deepEqual(suchbedingung('  Mauerw  KS-Stein '), { art: 'text', wert: 'mauerw:* & ks:* & stein:*' });
  assert.equal(suchbedingung('   '), null);
  assert.ok(!/[';]/.test(JSON.stringify(suchbedingung("a'b;c"))), 'nur Buchstaben und Ziffern kommen in die Abfrage');
  const n = register.nachschlag('position');
  assert.ok(n && n.gliederung.length === 3);
  assert.ok(register.kataloge.some((k) => k.nachschlag === 'position'));
});

test('Visitenkarte: Firma mit Ansprechpartner:in, weitere Wege, Sonderzeichen', async () => {
  const { vcard } = await import('../src/kern/vcard');
  const v = vcard({ name: 'Abba GmbH', art: 'firma', ansprechpartner: 'Aylin Cengiz', telefon: '0209-36155533', mobil: '0177-2779686', email: 'info@abba-gmbh.de', strasse: 'Luitpoldstr. 11', plz: '45879', ort: 'Gelsenkirchen', notiz: 'Tor 2; bitte klingeln' },
    [{ art: 'telefon', wert: '0209 1', bezeichnung: 'Zentrale' }, { art: 'person', wert: 'Max Muster', telefon: '0171 2', bezeichnung: 'Bauleiter' }]);
  assert.match(v, /^BEGIN:VCARD\r\nVERSION:3\.0\r\n/);
  assert.match(v, /\r\nN:Cengiz;Aylin;;;\r\n/);
  assert.match(v, /\r\nORG:Abba GmbH\r\n/);
  assert.match(v, /TEL;TYPE=CELL:0177-2779686/);
  assert.match(v, /ADR;TYPE=WORK:;;Luitpoldstr\. 11;Gelsenkirchen;;45879;/);
  assert.match(v, /TEL;TYPE=VOICE:0171 2/);
  assert.ok(v.includes('NOTE:Tor 2\\; bitte klingeln'), 'Semikolon maskiert');
  assert.ok(v.endsWith('END:VCARD\r\n'));
  const p = vcard({ name: 'Familie Kestner', art: 'bauherr', ist_firma: false });
  assert.ok(!/ORG:/.test(p) && /FN:Familie Kestner/.test(p), 'Bauherr:in als Person: keine Firma');
});

test('Filterbedingung: UND, ODER, NICHT wie im bisherigen Bauportal', async () => {
  const f = await import('../src/kern/filterbedingung');
  const k = (art: string, gewerk: string[], ort: string) => (a: string) => (a === 'art' ? [art] : a === 'gewerk' ? gewerk : a === 'ort' ? [ort] : []);
  const dach = k('firma', ['Dachdecker', 'Zimmerer'], 'Essen'), maler = k('firma', ['Maler'], 'Bochum'), amt = k('behoerde', [], 'Essen');
  let b = f.umschalten(f.LEER, 'gewerk', 'Dachdecker');
  b = f.umschalten(b, 'gewerk', 'maler');   // Groß/klein egal
  assert.deepEqual([dach, maler, amt].map((x) => f.erfuellt(b, x)), [true, true, false], 'innerhalb ODER');
  b = f.umschalten(b, 'ort', 'Essen');
  assert.deepEqual([dach, maler, amt].map((x) => f.erfuellt(b, x)), [true, false, false], 'zwischen UND');
  b = f.zwischenWechseln(b, 0);
  assert.deepEqual([dach, maler, amt].map((x) => f.erfuellt(b, x)), [true, true, true], 'zwischen ODER');
  b = f.nichtWechseln(f.zwischenWechseln(b, 0), 1, 0);   // NICHT Essen
  assert.deepEqual([dach, maler, amt].map((x) => f.erfuellt(b, x)), [false, true, false], 'NICHT');
  assert.equal(f.satz(b, (a) => ({ gewerk: 'Gewerk', ort: 'Ort' })[a]!), 'Gewerk: (Dachdecker ODER maler) UND Ort: NICHT Essen');
  b = f.opWechseln(b, 0);
  assert.ok(!f.erfuellt(b, dach) && !f.erfuellt(b, maler), 'innerhalb UND');
  b = f.umschalten(b, 'gewerk', 'Dachdecker');   // zweiter Klick nimmt heraus
  assert.deepEqual(f.werteIn(b, 'gewerk'), ['maler']);
  b = f.wertWeg(b, 0, 0);
  assert.equal(b.gruppen.length, 1); assert.equal(b.gruppen[0]!.art, 'ort'); assert.deepEqual(b.zwischen, []);
  assert.ok(f.erfuellt(f.LEER, amt), 'ohne Filter passt alles');
  // Spaltenfilter sammeln: „enthält“ kommt dazu (ODER), doppelte nicht, leere nicht
  let s = f.enthaeltDazu(f.LEER, 'gewerk', 'dach');
  s = f.enthaeltDazu(f.enthaeltDazu(f.enthaeltDazu(s, 'gewerk', 'Male'), 'gewerk', 'DACH'), 'gewerk', '  ');
  assert.equal(s.gruppen[0]!.werte.length, 2, 'zwei Werte gesammelt');
  assert.deepEqual([dach, maler, amt].map((x) => f.erfuellt(s, x)), [true, true, false], 'enthält „dach“ ODER „Male“');
});

test('Bautagebuch laut Bauzeitenplan: erwartete Firmen, Soll und Verzug', async () => {
  const { planAus } = await import('../src/module/bauzeitenplan/plan');
  const s = await import('../src/module/bautagebuch/soll');
  const v = (id: string, reihe: number, w: Record<string, unknown>) => ({ id, werte: { reihe, ebene: 0, ...w } as never });
  // Mo 02.11.2026: Rohbau 10 AT (Firma k1), danach Dach 5 AT (ohne Firma, Gewerk Zimmerer), Elektro 10 AT parallel ab Anfang (Firma k2, fertig)
  const plan = planAus({ vorgaenge: [v('a', 1, { name: 'Rohbau', dauer: 10, firma: 'k1', gewerk: 'Rohbau', fortschritt: 20 }), v('b', 2, { name: 'Dachstuhl', dauer: 5, gewerk: 'Zimmerer' }), v('c', 3, { name: 'Elektro', dauer: 10, firma: 'k2', fortschritt: 100 })],
    links: [{ id: 'l', werte: { von: 'a', nach: 'b', art: 'ea', abstand: 0 } as never }], zeitplan: { anfang: '2026-11-02', arbeitswoche: 5, bundesland: 'NW' }, frei: [], land: 'NW', heute: '2026-11-02' });
  const mi = s.erwartet(plan, '2026-11-11', new Set(), new Set());   // 8. Arbeitstag
  assert.deepEqual(mi.firmen.map((f) => f.firma), ['k1'], 'nur laufende, nicht fertige Firmen');
  assert.deepEqual(mi.ohne, [], 'Dach läuft noch nicht');
  assert.deepEqual(s.erwartet(plan, '2026-11-11', new Set(['k1']), new Set()).firmen, [], 'schon eingetragen: kein Vorschlag');
  const l = s.laufendAm(plan, '2026-11-11').find((x) => x.id === 'a')!;
  assert.equal(l.soll, 80, '8 von 10 Arbeitstagen'); assert.equal(l.verzug, 6, '(80 − 20) % von 10 AT');
  assert.ok(l.verzug >= s.RUEGE_AB, 'Terminrüge möglich');
  const dach = s.erwartet(plan, '2026-11-17', new Set(), new Set());
  assert.equal(dach.ohne[0]?.gewerk, 'Zimmerer', 'ohne Firma je Gewerk');
  assert.deepEqual(s.erwartet(plan, '2026-11-17', new Set(), new Set(['g:Zimmerer'])).ohne, [], 'ausgeblendet');
});

test('Verlauf: auf einen früheren Stand – nachgespielt aus dem Protokoll', async () => {
  const { rueckschritte } = await import('../src/server/verlauf');
  const b = (seq: number, art: string, id: string, werte: Record<string, unknown> | null = null, objekt = 'bericht_eintrag') => ({ seq, objekt, art, objekt_id: id, werte });
  const log = [b(1, 'anlegen', 'a', { text: 'Riss', erledigt: false }), b(2, 'anlegen', 'f', { name: 'x.jpg' }, 'foto'), b(3, 'aendern', 'a', { text: 'Riss in der Sohle' }),
    b(4, 'anlegen', 'c', { text: 'später' }), b(5, 'loeschen', 'a'), b(6, 'anlegen', 'g', { name: 'y.jpg' }, 'foto')];
  const felder = () => ['text', 'erledigt', 'name'];
  const r = rueckschritte(log, 3, felder, new Set(['foto']));
  assert.deepEqual(r.map((x) => `${x.art}:${x.objektId}`).sort(), ['loeschen:c', 'wiederherstellen:a'], 'später Angelegtes weg, Gelöschtes wieder, Fotos bleiben');
  const r1 = rueckschritte(log, 1, felder, new Set(['foto']));
  assert.deepEqual(r1.find((x) => x.art === 'aendern')?.werte, { text: 'Riss' }, 'geänderte Felder bekommen den Wert von damals');
  assert.deepEqual(rueckschritte(log, 6, felder, new Set()), [], 'Stand jetzt: nichts zu tun');
});

test('Ausschreibung: OZ sortieren, Summen, Preisspiegel und Rang', async () => {
  const r = await import('../src/module/ava/rechnung');
  const p = (id: string, oz: string, art: string, menge: number, ep: number) => ({ id, werte: { oz, art, menge, ep } });
  const pos = [p('t', '01', 'titel', 0, 0), p('b', '01.10', 'normal', 10, 5), p('a', '01.9', 'normal', 2, 100), p('e', '01.11', 'bedarf', 5, 1000)];
  assert.deepEqual(r.nachOz(pos).map((x) => x.id), ['t', 'a', 'b', 'e'], '01.9 vor 01.10');
  assert.equal(r.summeGeschaetzt(pos), 250, 'Bedarfsposition zählt nicht');
  const ang = [{ id: 'x', werte: { nachlass: 10 } }, { id: 'y', werte: { nachlass: 0 } }, { id: 'z', werte: { ausgeschlossen: true } }] as { id: string; werte: Record<string, number | boolean> }[];
  const preise: Record<string, number> = { 'x:a': 100, 'x:b': 6, 'y:a': 90, 'y:b': 5, 'z:a': 1, 'z:b': 1 };
  const w = r.wertung(pos, ang, (a, q) => preise[`${a}:${q}`] ?? null);
  assert.deepEqual(w.map((x) => [x.angebot, x.netto, x.nachLass, x.rang]), [['x', 260, 234, 2], ['y', 230, 230, 1], ['z', 12, 12, null]], 'Rang nach Nachlass, ausgeschlossen ohne Rang');
  assert.equal(r.guenstigster(pos, ang, (a, q) => preise[`${a}:${q}`] ?? null).get('a'), 90, 'günstigster nur unter gewerteten');
  assert.equal(r.zahl('1.234,5'), 1234.5);
});

test('GAEB DA XML: schreiben und wieder lesen (X83 ohne, X84 mit Preisen)', async () => {
  const g = await import('../src/module/ava/gaeb');
  const posten = [
    { oz: '01', art: 'titel' as const, kurztext: 'Innenwände', langtext: '', menge: null, einheit: '', ep: null },
    { oz: '01.0010', art: 'normal' as const, kurztext: 'Wände streichen', langtext: 'Dispersionsfarbe, zweimal\nWeiß & matt', menge: 200, einheit: 'm²', ep: 8 },
    { oz: '01.0020', art: 'bedarf' as const, kurztext: 'Risse schließen', langtext: '', menge: 10, einheit: 'm', ep: 20 },
    { oz: '02', art: 'titel' as const, kurztext: 'Decken', langtext: '', menge: null, einheit: '', ep: null },
    { oz: '02.0010', art: 'pauschal' as const, kurztext: 'Abdecken', langtext: '', menge: 1, einheit: 'psch', ep: 300 },
  ];
  const x83 = g.gaebSchreiben({ projekt: 'Haus A', name: 'Malerarbeiten', nummer: '034' }, posten, '83');
  const lv = g.gaebLesen(x83);
  assert.equal(lv.dp, '83'); assert.equal(lv.name, 'Malerarbeiten'); assert.equal(lv.projekt, 'Haus A');
  assert.deepEqual(lv.posten.map((x) => [x.oz, x.art, x.kurztext, x.menge, x.einheit, x.ep]), [
    ['01', 'titel', 'Innenwände', null, '', null], ['01.0010', 'normal', 'Wände streichen', 200, 'm2', null], ['01.0020', 'bedarf', 'Risse schließen', 10, 'm', null],
    ['02', 'titel', 'Decken', null, '', null], ['02.0010', 'pauschal', 'Abdecken', 1, 'psch', null]], 'X83: Gliederung, Arten, Mengen – ohne Preise');
  assert.equal(lv.posten[1]!.langtext, 'Dispersionsfarbe, zweimal\nWeiß & matt', 'Langtext mit Absätzen und Sonderzeichen');
  const x84 = g.gaebLesen(g.gaebSchreiben({ projekt: 'Haus A', name: 'Malerarbeiten', nummer: '034' }, posten, '84', (oz) => ({ '01.0010': 7.5, '02.0010': 280 } as Record<string, number>)[oz] ?? null));
  assert.deepEqual(x84.posten.filter((x) => x.ep != null).map((x) => [x.oz, x.ep]), [['01.0010', 7.5], ['02.0010', 280]], 'X84: Einheitspreise');
  assert.throws(() => g.gaebLesen('<foo/>'), /GAEB/);
});

test('Ausschreibung: Rechenleiter einer Abschlagsrechnung (Nachlass, USt, Einbehalt, bisherige Zahlungen)', async () => {
  const r = await import('../src/module/ava/rechnung');
  const re = [{ id: 'a', werte: { datum: '2026-05-01', betrag: 10000, geprueft: 9000, einbehalt: 5 } }, { id: 'b', werte: { datum: '2026-06-01', betrag: 20000, einbehalt: 5 } }] as { id: string; werte: Record<string, string | number> }[];
  const l1 = r.leiter(re, 'a', 2), l2 = r.leiter(re, 'b', 2);
  const zahlb = (l: { titel: string; betrag: number }[]) => l.find((x) => x.titel === 'Zahlbetrag')!.betrag;
  // a: 9000 − 2 % = 8820; +19 % = 10495,80; − 5 % (524,79) = 9971,01
  assert.equal(zahlb(l1), 9971.01);
  // b: 20000 − 2 % = 19600; brutto 23324; − 5 % = 22157,80; − 9971,01 = 12186,79
  assert.equal(zahlb(l2), 12186.79);
  assert.ok(l2.some((x) => x.titel === '− bisherige Zahlungen' && x.betrag === -9971.01));
});

test('Ausschreibung: OZ für eine neue Position', async () => {
  const r = await import('../src/module/ava/rechnung');
  const p = (oz: string, art = 'normal') => ({ id: oz, werte: { oz, art } });
  assert.equal(r.naechsteOz([]), '01.0010');
  assert.equal(r.naechsteOz([p('01', 'titel'), p('01.0010'), p('01.0030')]), '01.0040');
  assert.equal(r.naechsteOz([p('02', 'titel')]), '02.0010');
  assert.equal(r.naechsteOz([p('1.9'), p('1.10')]), '1.20');
});

test('Tabellendateien: CSV (Trennzeichen, Anführungszeichen) und Excel (.xlsx)', async () => {
  const t = await import('../src/kern/tabellendatei');
  assert.deepEqual(t.csvLesen('﻿Name;Ort\r\n"Kunz; Maler";Essen\r\n"Sag ""Hallo""";\n'), [['Name', 'Ort'], ['Kunz; Maler', 'Essen'], ['Sag "Hallo"', '']]);
  assert.deepEqual(t.csvLesen('a,b\n1,2'), [['a', 'b'], ['1', '2']], 'Komma erkannt');
  const { readFile } = await import('node:fs/promises');
  const x = await t.tabelleLesen('adressen.xlsx', new Uint8Array(await readFile(new URL('./daten/adressen.xlsx', import.meta.url))));
  assert.deepEqual(x.kopf, ['Firma', 'Ansprechpartner', 'Straße', 'PLZ', 'Ort', 'Telefon', 'E-Mail', 'Gewerk']);
  assert.deepEqual(x.zeilen[1], ['Elektro Brand', '', '', '45130', 'Essen', '', 'brand@example.de', 'Elektro'], 'leere Zellen an ihrem Platz, Zahl als Text');
  const c = await t.tabelleLesen('a.csv', new Uint8Array([0x4e, 0x61, 0x6d, 0x65, 0x0a, 0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72]));   // „Müller“ in Windows-1252
  assert.equal(c.zeilen[0]![0], 'Müller');
});

test('Adressen einlesen: Spalten zuordnen, Vorhandenes erkennen, nur Leeres ergänzen', async () => {
  const e = await import('../src/module/adressen/einlesen');
  assert.deepEqual(e.zuordnungVorschlagen(['Firma', 'Ansprechpartner', 'Straße', 'PLZ', 'Ort', 'Tel.', 'E-Mail', 'Gewerk', 'Sonstwas']),
    ['name', 'ansprechpartner', 'strasse', 'plz', 'ort', 'telefon', 'email', 'gewerk', '']);
  const z = e.zuordnungVorschlagen(['Firma', 'Ort', 'E-Mail', 'Anrede']);
  const v = e.kontakteAus([['Kunz GmbH', 'Essen', 'info@kunz.de', 'herr'], ['Neu AG', 'Bochum', '', 'Divers'], ['', '', '', '']], z,
    [{ id: 'k1', werte: { name: 'kunz gmbh', ort: '', telefon: '0201' } }]);
  assert.deepEqual(v.map((x) => [x.werte.name, x.aktion, x.vorhanden ?? null, x.werte.anrede ?? null]), [['Kunz GmbH', 'ergaenzen', 'k1', 'Herr'], ['Neu AG', 'neu', null, null]], 'leere Zeilen fallen weg');
  assert.deepEqual(e.ergaenzung({ name: 'kunz gmbh', ort: '', telefon: '0201' }, v[0]!.werte), { ort: 'Essen', email: 'info@kunz.de', anrede: 'Herr' }, 'Name und Telefon bleiben, Leeres wird gefüllt');
});

test('Aufmaß: Rechenweg ohne eval, je Zeile ein Ansatz mit Beschriftung; Prüfstand', async () => {
  const r = await import('../src/kern/rechenweg');
  assert.equal(r.ausdruck('2,5 * 3,10 - 0,8*2'), 2.5 * 3.1 - 1.6);
  assert.equal(r.ausdruck('(1+2)*3'), 9);
  assert.equal(r.ausdruck('-2+5'), 3);
  assert.equal(r.ausdruck('2*'), null);
  assert.equal(r.ausdruck('alert(1)'), null);
  assert.equal(r.ausdruck('1/0'), null);
  const w = r.rechenweg('Wand Nord: 2,5*3\nWand Süd: 2,5*3 - 1\n4');
  assert.equal(w.summe, 18); assert.equal(w.fehler, false);
  assert.equal(r.rechenweg('2*3\nquatsch').fehler, true);
  assert.equal(r.rechenweg('').summe, null);
  const a = await import('../src/module/ava/rechnung');
  assert.equal(a.pruefstand(12, 12), 'stimmt');
  assert.equal(a.pruefstand('12,5', 12), 'abweichend');
  assert.equal(a.pruefstand(12, null), 'offen');
});

test('Nachträge: Betrag aus Positionen oder Pauschale, Prognose mit offenen, abgelehnte zählen nicht', async () => {
  const a = await import('../src/module/ava/rechnung');
  const n = (id: string, stand: string, betrag: number | null = null) => ({ id, werte: { stand, betrag, nummer: `N${id}` } });
  const pos = [{ id: 'p1', werte: { nachtrag: '1', art: 'normal', menge: 10, ep: 20 } }, { id: 'p2', werte: { nachtrag: '1', art: 'bedarf', menge: 5, ep: 100 } }, { id: 'p3', werte: { nachtrag: null, art: 'normal', menge: 1, ep: 1 } }];
  assert.equal(a.nachtragNetto(n('1', 'beauftragt'), pos), 200, 'Bedarfsposition zählt nicht');
  assert.equal(a.nachtragNetto(n('2', 'angemeldet', 500), pos), 500, 'ohne Positionen: Pauschale');
  const s = a.auftragsstand(1000, [n('1', 'beauftragt'), n('2', 'angemeldet', 500), n('3', 'abgelehnt', 9999)], pos, 10);
  assert.deepEqual(s, { auftrag: 1000, beauftragt: 180, offen: 450, aktuell: 1180, prognose: 1630 });
  assert.equal(a.naechsterNachtrag([n('1', ''), n('3', '')]), 'N4');
  assert.equal(a.ausgeschrieben(pos[0]!), false);
});

test('Excel schreiben: .xlsx, das unser eigener Leser (und Excel) wieder liest', async () => {
  const x = await import('../src/kern/xlsx');
  const t = await import('../src/kern/tabellendatei');
  const datei = x.xlsxSchreiben([['Name', 'Menge', 'Datum', 'Notiz'], ['Müller & Söhne <GmbH>', 12.5, new Date(2026, 10, 26), ''], ['Kunz', 3, null, 'zwei\nZeilen']], 'Adressen');
  const r = await t.tabelleLesen('a.xlsx', datei);
  assert.deepEqual(r.kopf, ['Name', 'Menge', 'Datum', 'Notiz']);
  assert.equal(r.zeilen[0]![0], 'Müller & Söhne <GmbH>');
  assert.equal(r.zeilen[0]![1], '12.5');
  assert.equal(r.zeilen[1]![3], 'zwei\nZeilen');
});

test('Versand & Rücklauf: Stand je Bieter:in, Zähler, fälliges Nachfassen', async () => {
  const a = await import('../src/module/ava/rechnung');
  const b = (w: Record<string, string | null>) => ({ id: Math.random().toString(), werte: { angeschrieben: '2026-11-01', rueckmeldung: null, eingang: null, nachfassen: null, ...w } });
  const l = [b({ eingang: '2026-11-20', rueckmeldung: 'gibt_nicht_ab' }), b({ rueckmeldung: 'will_abgeben', nachfassen: '2026-11-25' }), b({ rueckmeldung: 'gibt_nicht_ab', nachfassen: '2026-11-25' }), b({ angeschrieben: null })];
  assert.deepEqual(l.map(a.ruecklaufVon), ['abgegeben', 'will_abgeben', 'gibt_nicht_ab', 'offen']);
  assert.deepEqual(a.ruecklaufZaehlen(l), { abgegeben: 1, will_abgeben: 1, gibt_nicht_ab: 1, offen: 1, angeschrieben: 3 });
  assert.deepEqual(l.map((x) => a.nachfassenFaellig(x, '2026-11-26')), [false, true, false, false]);
});

test('Werte aufräumen: ähnliche Gewerke und Stichwörter finden, zusammenführen ohne Doppelte', async () => {
  const w = await import('../src/module/adressen/werte');
  const k = (id: string, gewerk: string, stichworte = '') => ({ id, werte: { gewerk, stichworte } });
  const l = [k('1', 'Elektro'), k('2', 'elektro'), k('3', 'Elektroinstallation'), k('4', 'Maler'), k('5', 'Malerarbeiten'), k('6', 'Dachdecker'), k('7', 'Elektro', 'Fliesen, fliesen ,  Bad'), k('8', 'Sanitär', 'Bad, Fliessen')];
  const z = w.werteZaehlen(l, 'gewerk', false);
  assert.deepEqual(z.find((x) => x.wert === 'Elektro'), { wert: 'Elektro', anzahl: 2 });
  const g = w.aehnlicheGruppen(z);
  assert.deepEqual(g.map((x) => x.map((y) => y.wert)), [['Elektro', 'Elektroinstallation', 'elektro'], ['Maler', 'Malerarbeiten']], 'häufigster vorn, dann groß vor klein; Dachdecker und Sanitär allein');
  const s = w.werteZaehlen(l, 'stichworte', true);
  assert.deepEqual(s.map((x) => x.wert), ['Bad', 'fliesen', 'Fliesen', 'Fliessen']);
  assert.deepEqual(w.aehnlicheGruppen(s).map((x) => x.length), [3], 'Fliesen, fliesen, Fliessen – Bad bleibt allein');
  assert.deepEqual(w.umbenennen(l, 'stichworte', true, ['fliesen', 'Fliessen'], 'Fliesen'), [{ id: '7', werte: { stichworte: 'Fliesen, Bad' } }, { id: '8', werte: { stichworte: 'Bad, Fliesen' } }]);
  assert.deepEqual(w.umbenennen(l, 'gewerk', false, ['elektro', 'Elektroinstallation'], 'Elektro'), [{ id: '2', werte: { gewerk: 'Elektro' } }, { id: '3', werte: { gewerk: 'Elektro' } }]);
});

test('KI-Kosten: Preise je 1 Mio. Tokens, Kostendeckel, Guthaben', async () => {
  const k = await import('../src/kern/kikosten');
  assert.equal(k.kosten(2_000_000, 500_000, { preis_ein: 3, preis_aus: '15' }), 13.5);
  assert.equal(k.deckelErreicht(13.5, 10), true);
  assert.equal(k.deckelErreicht(9.99, '10'), false);
  assert.equal(k.deckelErreicht(1000, null), false, 'ohne Deckel nie');
  assert.equal(k.guthaben(50, 13.5), 36.5);
  assert.equal(k.guthaben(null, 13.5), null);
});

test('Gewerke & Firmen: Gewerke aus dem Plan mit Einsatz (Pausen bleiben Lücken), Firma in den Plan', async () => {
  const { planAus } = await import('../src/module/bauzeitenplan/plan');
  const g = await import('../src/module/bauzeitenplan/gewerke');
  const { isoAus } = await import('../src/module/bauzeitenplan/kalender');
  const v = (id: string, reihe: number, w: Record<string, unknown>) => ({ id, werte: { reihe, ebene: 0, ...w } as never });
  // Mo 02.11.2026: Mauern 3 AT + 2 Pause + 2 AT (Rohbau, k1); Decke 2 AT danach (Rohbau, ohne Firma); Elektro 5 AT parallel
  const vs = [v('a', 1, { name: 'Mauern', dauer: 5, unterbrechung: '3+(2)+2', gewerk: 'Rohbau', firma: 'k1', vob: 'g330' }), v('b', 2, { name: 'Decke', dauer: 2, gewerk: 'Rohbau' }), v('c', 3, { name: 'Leitungen', dauer: 5, gewerk: 'Elektro' })];
  const plan = planAus({ vorgaenge: vs, links: [{ id: 'l', werte: { von: 'a', nach: 'b', art: 'ea', abstand: 0 } as never }], zeitplan: { anfang: '2026-11-02', arbeitswoche: 5, bundesland: 'NW' }, frei: [], land: 'NW', heute: '2026-11-02' });
  const w = new Map(vs.map((x) => [x.id, x.werte]));
  const z = g.gewerkeAus(plan, (id) => w.get(id));
  assert.deepEqual(z.map((x) => x.gewerk), ['Elektro', 'Rohbau'], 'gleicher Anfang: A–Z');
  const rb = z.find((x) => x.gewerk === 'Rohbau')!;
  assert.deepEqual(rb.einsatz.map(([a, b]) => `${isoAus(a)}–${isoAus(b)}`), ['2026-11-02–2026-11-04', '2026-11-09–2026-11-12'], 'Pause Do/Fr als Lücke, Decke schließt an');
  assert.deepEqual([rb.leistungen.length, rb.firmen, rb.vob], [2, ['k1'], 'g330']);
  assert.ok(g.passtZumGewerk('Heizung, Sanitär', 'Heizung') && g.passtZumGewerk('Elektroinstallation', 'Elektro') && !g.passtZumGewerk('Maler', 'Elektro'));
  const ls = vs.map((x) => ({ id: x.id, werte: x.werte as Record<string, string | null> }));
  assert.deepEqual(g.firmaInDenPlan(ls, 'Rohbau', 'k9', null), [{ id: 'b', werte: { firma: 'k9' } }], 'nur leere – k1 bleibt (Nachunternehmer)');
  assert.deepEqual(g.firmaInDenPlan(ls, 'Rohbau', 'k9', 'k1').map((x) => x.id), ['a', 'b'], 'die bisherige Firma des Gewerks wird ersetzt');
});

test('Handbuch aus dem Programm: drei Stufen, Admin-Ansichten und Rechte nur für Admins', async () => {
  const { handbuchHtml } = await import('../src/kern/handbuch');
  const MODULE = (await import('../src/module/index')).register.module;
  const a = handbuchHtml(MODULE, 'anwender', { buero: 'GK3', version: 'v1', erzeugt: 'heute' });
  const ad = handbuchHtml(MODULE, 'admin', { buero: 'GK3', version: 'v1', erzeugt: 'heute' });
  const en = handbuchHtml(MODULE, 'entwickler', { buero: 'GK3', version: 'v1', erzeugt: 'heute', aufbau: '# Aufbau <test>' });
  assert.match(a, /Handbuch für Anwender:innen/); assert.match(a, /<h2 id="bautagebuch">Bautagebuch<\/h2>/); assert.match(a, /Strg\+K/);
  assert.ok(!a.includes('id="rollen"') && !a.includes('(nur Administrator:innen)</small>'), 'Anwender:innen: keine Rechte, keine Admin-Ansichten');
  assert.ok(ad.includes('(nur Administrator:innen)</small>'));
  assert.ok(ad.includes('id="rollen"') && !ad.includes('Aufbau des Programms'));
  assert.ok(en.includes('Aufbau des Programms') && en.includes('# Aufbau &lt;test&gt;') && en.includes('<code>kontakt.name</code>'), 'Entwickler:innen: Aufbau und technische Namen');
});
