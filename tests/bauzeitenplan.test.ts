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
  // später fertig als geplant: Mauern 3 AT länger – Decke rückt nach, der Überzug steht am Ende
  const u = rechnen(v.map((x) => (x.id === 'mauern' ? { ...x, ueberzug: 3 } : x)), l, k);
  assert.deepEqual([u.termine.get('mauern')!.f, u.termine.get('mauern')!.ueberzug, u.termine.get('decke')!.s], [13, 3, 13]);
  assert.equal(rechnen(v.map((x) => (x.id === 'start' ? { ...x, ueberzug: 3 } : x)), l, k).termine.get('start')!.ueberzug, 0, 'Meilenstein: kein Überzug');
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

test('Austausch und Ausdruck: Gantt-Plan lesen, Sicherung, CSV, MS Project, Seiten', async () => {
  const { altplanLesen, planJsonAus, csvAus, mspdiAus } = await import('../src/module/bauzeitenplan/austausch');
  const { planAus } = await import('../src/module/bauzeitenplan/plan');
  const { planDruck, STANDARD } = await import('../src/module/bauzeitenplan/druck');
  const alt = { name: 'Haus A', start: tagAus('2026-11-16'), cal: { week: 5, state: 'NW', state_hand: true, free: [{ from: '2026-12-24', to: '2027-01-01', name: 'Betriebsferien', yearly: true }] }, gwColors: { Rohbau: '#78909c' },
    tasks: [
      { uid: 1, name: 'Rohbau', lvl: 0, dur: 0 },
      { uid: 2, name: 'Mauern', lvl: 1, dur: 10, gw: 'Rohbau', res: 'Schmitz', pct: 20, preds: [] },
      { uid: 3, name: 'Decke', lvl: 1, dur: 7, gw: 'Rohbau', segs: [{ d: 3 }, { d: 4, gap: 2 }], preds: [{ uid: 2, type: 'FS', lag: 1 }, { uid: 99, type: 'FS' }] },
      { uid: 4, name: 'Dach', lvl: 0, dur: 5, cons: tagAus('2027-01-11'), preds: [{ uid: 1, type: 'SS', lag: 3 }] },
    ], trades: { Rohbau: { firm: 'x' } } };
  const a = altplanLesen(alt, 'alt-gantt:7:');
  assert.deepEqual([a.zeitplan, a.frei.length, a.vorgaenge.length, a.links.length], [{ anfang: '2026-11-16', arbeitswoche: '5', bundesland: 'NW' }, 1, 4, 2]);
  assert.deepEqual(a.vorgaenge[2]!.werte.unterbrechung, '3+(2)+4');
  assert.equal(a.vorgaenge[1]!.werte.farbe, '#78909c', 'Farbe des Gewerks bleibt');
  assert.equal(a.vorgaenge[3]!.werte.anfang_nicht_vor, '2027-01-11');
  assert.deepEqual(a.links.map((l) => [l.von, l.nach, l.werte.art, l.werte.abstand]), [['alt-gantt:7:2', 'alt-gantt:7:3', 'ea', 1], ['alt-gantt:7:1', 'alt-gantt:7:4', 'aa', 3]]);
  assert.equal(a.hinweise.length, 2, 'fremde Verknüpfung und Firmen werden erklärt');
  assert.throws(() => altplanLesen({ name: 'x' }, ''), /kein Bauzeitenplan/);
  // als Plan: Sicherung und wieder lesen ergibt dasselbe
  const id = (k: string) => k.split(':').pop()!;
  const plan = planAus({ vorgaenge: a.vorgaenge.map((v) => ({ id: id(v.kennung), werte: v.werte })), links: a.links.map((l) => ({ id: l.kennung, werte: { ...l.werte, von: id(l.von), nach: id(l.nach) } })), zeitplan: a.zeitplan, frei: a.frei.map((f) => ({ id: f.kennung, werte: f.werte })), land: '', heute: '2026-11-25' });
  const wieder = altplanLesen(JSON.parse(planJsonAus(plan, 'Haus A', a.zeitplan, a.frei)), 'x:');
  assert.deepEqual(wieder.vorgaenge.map((v) => [v.werte.name, v.werte.dauer, v.werte.ebene, v.werte.unterbrechung]), a.vorgaenge.map((v) => [v.werte.name, v.werte.dauer, v.werte.ebene, v.werte.unterbrechung]));
  assert.equal(wieder.links.length, 2);
  const csv = csvAus(plan);
  assert.ok(csv.startsWith('﻿Nr.;Gliederung;Leistung') && csv.includes('3;1;  Decke;7;'), csv.split('\r\n')[3]);
  const xml = mspdiAus(plan, 'Haus A');
  assert.equal((xml.match(/<Task>/g) ?? []).length, 4);
  assert.ok(xml.includes('<PredecessorLink><PredecessorUID>2</PredecessorUID><Type>1</Type>'));
  // Ausdruck: A3 quer eine Seite; viele Zeilen auf A4 hoch mehrere; Rolle wächst mit dem Plan
  const d = { titel: 'Bauzeitenplan Haus A', unter: '', buero: 'GK3', zeilen: plan.zeilen, links: plan.links, kal: plan.kal, ende: plan.erg.endeDatum, heute: '2026-11-25' };
  assert.equal(planDruck(d, STANDARD).seiten, 1);
  const viele = { ...d, zeilen: Array.from({ length: 200 }, (_, i) => ({ ...plan.zeilen[1]!, id: `z${i}`, nr: i + 1 })) };
  assert.ok(planDruck(viele, { ...STANDARD, format: 'A4', quer: false }).seiten >= 4);
  assert.equal(planDruck(d, { ...STANDARD, anpassen: 'breite', seitenBreit: 2 }).seiten, 2, 'auf zwei Seiten breit');
  const rolle = planDruck(d, { ...STANDARD, format: 'ROLLE', rolle: 914, anpassen: 'fest', mmJeTag: 5 });
  assert.ok(rolle.seiten === 1 && rolle.blatt.b > 300 && rolle.html.includes('@page { size: '));
});

test('Planungsassistent: Empfehlung, Bauweise, Überbrücken, Dauern aus Mengen, Einheiten im Takt', async () => {
  const { katalogAus, assistent, angabenAusGebaeude } = await import('../src/module/bauzeitenplan/assistent');
  const L = (id: string, w: Record<string, unknown>) => ({ werte: { kennung: id, bezug: 'bau', dauer: 2, vorgaenger: 'start', ...w } as never });
  const vorlagen = [
    L('be', { name: 'Baustelleneinrichtung', fest: true }),
    L('keller', { name: 'Keller', vorgaenger: 'be', dauer: 10 }),
    L('grund', { name: 'Bodenplatte', vorgaenger: 'keller', bezugsgroesse: 'gr', leistungswert: 10 }),
    L('mauer', { name: 'Mauerwerk', vorgaenger: 'grund' }),
    L('estrich', { name: 'Estrich', bezug: 'we', vorgaenger: 'mauer', dauer: 3 }),
    L('estr_tr', { name: 'Estrich trocknen', bezug: 'we', vorgaenger: 'estrich', dauer: 20, fest: true, wartezeit: true }),
    L('maler', { name: 'Maler', bezug: 'we', vorgaenger: 'estr_tr', dauer: 4 }),
  ];
  const r = (art: string, kennung: string, daten: unknown) => ({ werte: { art, kennung, name: kennung, daten: JSON.stringify(daten) } as never });
  const regeln = [
    r('abschnitte', 'abschnitte', [{ k: 'roh', n: 'Rohbau' }, { k: 'aus', n: 'Ausbau' }]),
    r('bezug', 'bezug', { ref: { bau: 140, we: 80 }, leistung: { be: { ph: 'roh' }, keller: { ph: 'roh' }, grund: { ph: 'roh' }, mauer: { ph: 'roh' }, estrich: { ph: 'aus' }, estr_tr: { ph: 'aus' }, maler: { ph: 'aus' } } }),
    r('profil', 'profil:neubau_efh', { k: 'neubau_efh', n: 'Neubau EFH', rec: ['be', 'grund', 'mauer', 'estrich', 'estr_tr', 'maler'], opt: ['keller'], choice: { keller: 'none' }, dg: 'aus', takt: 'versetzt' }),
    r('bauweise', 'bauweise:keller', { k: 'keller', ph: 'roh', n: 'Keller', types: ['neubau_efh'], opts: [{ k: 'none', n: 'ohne', on: [] }, { k: 'wu', n: 'WU-Beton', on: ['keller'], ovr: { keller: { n: 'Keller WU-Beton', d: 12 } } }] }),
    r('kombi', 'kombi', { geb: [{ k: 'ef', n: 'EFH', fl: 'wf', h: 2.9, wand: 2.8, groesse: 'efh', area: 140, units: 1, floors: 2, naming: 'whg', std: '', opt: '', weg: '' }], mass: [{ k: 'nb', n: 'Neubau', base: { efh: 'neubau_efh' }, neu: 1 }], ber: [], aussen: '', immer: '', nurNeu: '' }),
  ];
  const kat = katalogAus(vorlagen, regeln);
  const a = assistent(kat, { geb: 'ef', mass: ['nb'], ber: [], denkmal: false, flaeche: 140, einheiten: 0, geschosse: 0, dg: '', takt: 'versetzt', wahl: {} })!;
  assert.equal(a.bauart.n, 'EFH · Neubau');
  assert.deepEqual([...a.auswahl()].sort(), ['be', 'estr_tr', 'estrich', 'grund', 'maler', 'mauer'], 'ohne Keller');
  const ohne = a.plan();
  assert.ok(ohne.links.some((l) => l.von === 'assistent:be@-1' && l.nach === 'assistent:grund@-1'), 'Keller nicht gewählt: Bodenplatte folgt direkt der Baustelleneinrichtung');
  assert.equal(a.dauer('be'), 2, 'feste Dauer');
  // Bauweise „WU-Keller“: Keller kommt dazu, mit Namen und Dauer der Ausführung
  const k = assistent(kat, { geb: 'ef', mass: ['nb'], ber: [], denkmal: false, flaeche: 140, einheiten: 0, geschosse: 0, dg: '', takt: 'versetzt', wahl: { keller: 'wu' } })!;
  assert.ok(k.auswahl().has('keller'));
  assert.equal(k.leistung('keller')!.n, 'Keller WU-Beton');
  assert.ok(k.dauer('keller') >= 12);
  // Dauer aus Menge: Bodenplatte mit echter Grundfläche aus dem Gebäudemodell
  const g = angabenAusGebaeude({ nutzung: 'efh', massnahme: 'neubau', wohnflaeche: 140, einheiten: 3, bgf: 200 } as never, [{ werte: { art: 'bodenplatte', menge: 100, einheit: 'm2' } }] as never, 2);
  assert.deepEqual([g.geb, g.mass, g.mengen?.gr, g.geschosse], ['ef', ['nb'], 100, 2]);
  const m = assistent(kat, { ...g, takt: 'versetzt' })!;
  assert.equal(m.dauer('grund'), 10, '100 m² ÷ 10 m²/Tag');
  // drei Einheiten im Takt: Maler der Einheit 2 wartet auf den Maler der Einheit 1, das Trocknen läuft überall zugleich
  const p = m.plan();
  assert.ok(p.zeilen.some((z) => z.werte.name === 'Wohnung 3 fertiggestellt'));
  const hat = (von: string, nach: string) => p.links.some((l) => l.von === `assistent:${von}` && l.nach === `assistent:${nach}`);
  assert.ok(hat('maler@0', 'maler@1') && !hat('estr_tr@0', 'estr_tr@1') && hat('mauer@-1', 'estrich@2'));
});

test('Löschen: Dauer auf die Hauptleistung umlegen (gleiches Gewerk in der Gruppe, sonst Vorgänger)', async () => {
  const { umlegenVorschlag, umlegen } = await import('../src/module/bauzeitenplan/bearbeiten');
  const v = [
    { id: 'g', reihe: 1, ebene: 0, dauer: 0 },
    { id: 'a', reihe: 2, ebene: 1, dauer: 5, gewerk: 'Maler' },
    { id: 'b', reihe: 3, ebene: 1, dauer: 2, gewerk: 'Maler' },
    { id: 'c', reihe: 4, ebene: 1, dauer: 3, gewerk: 'Fliesen', unterbrechung: '1+(2)+2' },
    { id: 'd', reihe: 5, ebene: 1, dauer: 1, gewerk: 'Elektro' },
  ];
  const l = [{ id: 'l1', von: 'c', nach: 'd', art: 'ea' as const, abstand: 0 }];
  assert.deepEqual(umlegenVorschlag(v, l, ['b', 'd']), [{ id: 'b', dauer: 2, ziel: 'a' }, { id: 'd', dauer: 1, ziel: 'c' }]);
  assert.deepEqual(umlegen(v, [{ dauer: 2, ziel: 'a' }, { dauer: 1, ziel: 'c' }, { dauer: 4, ziel: null }]).map((b) => b.werte),
    [{ dauer: 7 }, { unterbrechung: '1+(2)+3', dauer: 4 }]);
});

test('Änderungssätze ohne KI: länger, auf, später, % fertig, nach – Leistung über den Namen', async () => {
  const { satzVerstehen, istAenderungssatz } = await import('../src/module/bauzeitenplan/saetze');
  const v = [
    { id: 'm', name: 'Malerarbeiten innen', dauer: 5, fortschritt: 0, gruppe: false, anfang: '2026-12-01', vorgaenger: [] },
    { id: 'f', name: 'Fliesenarbeiten', dauer: 4, fortschritt: 0, gruppe: false, anfang: '2026-12-07', vorgaenger: [] },
    { id: 'e', name: 'Estrich', dauer: 3, fortschritt: 0, gruppe: false, anfang: '2026-11-25', vorgaenger: [] },
  ];
  const tag = (iso: string, n: number) => `${iso}+${n}`;
  let k = 0; const neu = () => `n${++k}`;
  const s = (t: string) => satzVerstehen(t, v, tag, { projekt: 'p', version: 'x' }, neu);
  assert.deepEqual((s('Maler 5 Tage länger') as { befehle: { werte?: unknown }[] }).befehle.map((b) => b.werte), [{ dauer: 10 }]);
  assert.deepEqual((s('Estrich auf 8 AT') as { befehle: { werte?: unknown }[] }).befehle.map((b) => b.werte), [{ dauer: 8 }]);
  assert.deepEqual((s('Fliesen 1 Woche später') as { befehle: { werte?: unknown }[] }).befehle.map((b) => b.werte), [{ anfang_nicht_vor: '2026-12-07+5' }]);
  assert.deepEqual((s('Estrich 50 % fertig') as { befehle: { werte?: unknown }[] }).befehle.map((b) => b.werte), [{ fortschritt: 50 }]);
  const n = s('Maler nach Fliesen') as { befehle: { objekt: string; werte?: Record<string, unknown> }[] };
  assert.deepEqual([n.befehle[0]!.objekt, n.befehle[0]!.werte!.von, n.befehle[0]!.werte!.nach], ['verknuepfung', 'f', 'm']);
  assert.deepEqual(s('Dach 2 Tage länger'), { fehler: 'Keine Leistung „Dach“ im Plan gefunden.' });
  assert.equal(s('Hallo Welt'), null);
  assert.ok(istAenderungssatz('Fliesen 1 Woche später') && !istAenderungssatz('Wann ist der Estrich fertig?'));
});
