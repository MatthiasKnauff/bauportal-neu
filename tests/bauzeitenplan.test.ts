// Prüfungen des Bauzeitenplans ohne Datenbank: Kalender und Feiertage, Schreibweise, Terminrechnung, Bearbeiten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Kalender, feiertage, isoAus, ostern, tagAus } from '../src/module/bauzeitenplan/kalender';
import { abschnitteLesen, abschnitteSchreiben, rechnen, type Eingang, type Verbindung } from '../src/module/bauzeitenplan/rechnung';
import { dauerLesen, vorgaengerLesen, vorgaengerSchreiben } from '../src/module/bauzeitenplan/schreibweise';

test('Kalender: Ostern, Feiertage je Bundesland, Arbeitstage', () => {
  assert.deepEqual([2024, 2025, 2026, 2027].map((j) => isoAus(ostern(j))), ['2024-03-31', '2025-04-20', '2026-04-05', '2027-03-28']);
  const nw = [...feiertage(2026, 'NW').entries()].map(([t, n]) => `${isoAus(t)} ${n}`);
  assert.ok(nw.includes('2026-06-04 Fronleichnam') && nw.includes('2026-11-01 Allerheiligen') && !nw.some((x) => x.includes('Reformationstag')));
  assert.ok([...feiertage(2026, 'SN').entries()].some(([t, n]) => n === 'Buß- und Bettag' && isoAus(t) === '2026-11-18'));
  assert.equal(feiertage(2026, 'DE').size, 9, 'bundesweit: 9 Feiertage');
  const k = new Kalender({ anfang: '2026-12-21', arbeitswoche: 5, land: 'NW', frei: [{ von: '2026-12-24', bis: '2027-01-01', name: 'Weihnachtsferien', jaehrlich: true }] });
  assert.equal(isoAus(k.start), '2026-12-21');
  assert.equal(k.anfangsdatum(3), '2027-01-04', 'Mo–Mi, dann Ferien bis Neujahr, Wochenende');
  assert.equal(k.frei(tagAus('2027-12-27')), 'Weihnachtsferien', 'jährlich wiederkehrend');
  assert.equal(k.frei(tagAus('2026-12-26')), '', 'Samstag ist kein Arbeitstag, aber auch kein Feiertag-Name');
  assert.equal(k.arbeitstag(tagAus('2026-12-24')), 3);
  assert.equal(new Kalender({ anfang: '2026-11-16', arbeitswoche: 6 }).anfangsdatum(5), '2026-11-21', '6-Tage-Woche: Samstag arbeitet');
});

test('Schreibweise: Dauer und Vorgänger wie in Projektsoftware', () => {
  assert.deepEqual(['5', '5t', '2w', '0', '3 Tage', 'x'].map((t) => dauerLesen(t)), [5, 5, 10, 0, 3, null]);
  assert.equal(dauerLesen('2w', 6), 12);
  assert.deepEqual(vorgaengerLesen('3;4AA+2t; 5ee-1w'), [{ nr: 3, art: 'ea', abstand: 0 }, { nr: 4, art: 'aa', abstand: 2 }, { nr: 5, art: 'ee', abstand: -5 }]);
  assert.equal(vorgaengerLesen('3XY'), null);
  assert.equal(vorgaengerSchreiben([{ nr: 3, art: 'ea', abstand: 0 }, { nr: 4, art: 'aa', abstand: 2 }, { nr: 7, art: 'ea', abstand: -1 }]), '3;4AA+2t;7EA-1t');
  assert.deepEqual(abschnitteLesen('3+(2)+4'), [{ dauer: 3, pause: 0 }, { dauer: 4, pause: 2 }]);
  assert.equal(abschnitteSchreiben([{ dauer: 3, pause: 0 }, { dauer: 4, pause: 2 }]), '3+(2)+4');
  assert.equal(abschnitteLesen('5'), null);
});

test('Terminrechnung: Arten, Abstände, Gruppen, Unterbrechung, kritischer Weg, Zirkelbezug', () => {
  const k = new Kalender({ anfang: '2026-11-16', arbeitswoche: 5, land: 'NW' });   // Montag
  const v: Eingang[] = [
    { id: 'start', ebene: 0, dauer: 0 },
    { id: 'rohbau', ebene: 0, dauer: 0 },
    { id: 'mauern', ebene: 1, dauer: 10 },
    { id: 'decke', ebene: 1, dauer: 5 },
    { id: 'elektro', ebene: 0, dauer: 4 },
    { id: 'putz', ebene: 0, dauer: 6, abschnitte: [{ dauer: 2, pause: 0 }, { dauer: 4, pause: 3 }] },
    { id: 'maler', ebene: 0, dauer: 3, anfangNichtVor: '2027-02-01' },
  ];
  const l: Verbindung[] = [
    { id: 'l1', von: 'start', nach: 'rohbau', art: 'ea', abstand: 0 },
    { id: 'l2', von: 'mauern', nach: 'decke', art: 'ea', abstand: 0 },
    { id: 'l3', von: 'rohbau', nach: 'elektro', art: 'ea', abstand: 2 },
    { id: 'l4', von: 'mauern', nach: 'putz', art: 'aa', abstand: 3 },
    { id: 'l5', von: 'elektro', nach: 'putz', art: 'ee', abstand: 0, nachAbschnitt: 0 },
  ];
  const r = rechnen(v, l, k);
  const t = (id: string) => r.termine.get(id)!;
  assert.deepEqual([t('mauern').s, t('decke').s, t('rohbau').s, t('rohbau').f, t('rohbau').gruppe], [0, 10, 0, 15, true]);
  assert.equal(t('elektro').s, 17, 'nach der Gruppe Rohbau plus 2 Tage');
  assert.deepEqual(t('putz').abschnitte, [{ s: 19, f: 21 }, { s: 24, f: 28 }], 'erster Abschnitt endet mit Elektro (EE)');
  assert.equal(t('maler').anfang, '2027-02-01');
  assert.equal(t('decke').anfang, '2026-11-30');
  assert.equal(t('mauern').ende, '2026-11-27');
  assert.ok(t('maler').kritisch && !t('putz').kritisch && t('putz').puffer > 0);
  assert.equal(r.endeDatum, '2027-02-03');
  const z = rechnen(v, [...l, { id: 'zurueck', von: 'elektro', nach: 'mauern', art: 'ea', abstand: 0 }], k);
  assert.equal(z.zyklen.length, 1, 'Zirkelbezug erkannt, die Rechnung läuft trotzdem');
  assert.equal(rechnen(v, [...l, { id: 'eigen', von: 'rohbau', nach: 'mauern', art: 'ea', abstand: 0 }], k).zyklen.length, 0, 'Gruppe → eigener Teil ist kein Zirkelbezug');
});

test('Bearbeiten: einfügen in die Kette, löschen überbrückt, Vorgänger, gliedern, verschieben', async () => {
  const { einfuegen, loeschen, vorgaengerSetzen, gliedern, verschieben } = await import('../src/module/bauzeitenplan/bearbeiten');
  let n = 0; const neu = () => `n${++n}`;
  const z = { projekt: 'p', version: 'v' };
  const v = [{ id: 'a', reihe: 1, ebene: 0 }, { id: 'b', reihe: 2, ebene: 0 }, { id: 'c', reihe: 3, ebene: 0 }];
  const l = [{ id: 'ab', von: 'a', nach: 'b', art: 'ea' as const, abstand: 0 }, { id: 'bc', von: 'b', nach: 'c', art: 'ea' as const, abstand: 2 }];
  const e = einfuegen(v, l, 1, { name: 'neu' }, z, neu, true);
  assert.deepEqual(e.befehle.map((b) => [b.objekt, b.art, b.werte?.von ?? '', b.werte?.nach ?? '', b.werte?.reihe ?? '']), [['vorgang', 'anlegen', '', '', 1.5], ['verknuepfung', 'loeschen', '', '', ''], ['verknuepfung', 'anlegen', 'a', e.id, ''], ['verknuepfung', 'anlegen', e.id, 'b', '']]);
  const d = loeschen(v, l, ['b'], z, neu, true);
  assert.deepEqual(d.filter((b) => b.art === 'anlegen').map((b) => [b.werte!.von, b.werte!.nach, b.werte!.abstand]), [['a', 'c', 2]], 'A → B → C, B weg: A → C, Abstand bleibt');
  assert.equal(d.filter((b) => b.art === 'loeschen').length, 3);
  const s = vorgaengerSetzen(v, l, 'c', [{ nr: 1, art: 'aa', abstand: 1 }], z, neu);
  assert.deepEqual(s.map((b) => [b.art, b.werte?.von ?? b.objektId]), [['loeschen', 'bc'], ['anlegen', 'a']]);
  assert.throws(() => vorgaengerSetzen(v, l, 'c', [{ nr: 9, art: 'ea', abstand: 0 }], z, neu), /Zeile 9/);
  assert.deepEqual(gliedern(v, l, 'b', 1).map((b) => [b.objekt, b.art]), [['verknuepfung', 'loeschen'], ['vorgang', 'aendern']], 'a wird Gruppe über b: die Verknüpfung a → b fällt weg');
  assert.deepEqual(gliedern(v, l, 'a', 1), [], 'die erste Zeile lässt sich nicht einrücken');
  const g = [{ id: 'a', reihe: 1, ebene: 0 }, { id: 'a1', reihe: 2, ebene: 1 }, { id: 'b', reihe: 3, ebene: 0 }];
  assert.deepEqual(verschieben(g, 'b', -1).map((b) => [b.objektId, b.werte!.reihe]), [['b', 1], ['a', 2], ['a1', 3]], 'Gruppe wandert als Ganzes');
});
