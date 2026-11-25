// Diktat im Bautagebuch: KI-Antwort lesen und auf den Bericht verteilen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diktatBefehle, diktatLesen } from '../src/server/diktat';

test('Diktat: Antwort lesen und verteilen', () => {
  assert.equal(diktatLesen('kein json'), null);
  const g = diktatLesen('Hier: {"wetter":"sonnig","temperatur":14,"anwesend":[{"firma":"Müller Bau","personen":3,"taetigkeit":"Mauern EG"},{"firma":"Unbekannt GmbH","personen":null,"taetigkeit":""}],"notizen":["Kran steht"],"maengel":[{"text":"Abdichtung fehlt","firma":"müller bau","frist":"2026-11-27"}],"aufgaben":[{"text":"Plan schicken","frist":"Freitag"}],"weisungen":[]} Ende')!;
  const bericht = { id: 'b', projekt: 'p', wetter: '', temperatur: null };
  const { liste, je } = diktatBefehle(g, bericht, [{ id: 'k1', name: 'Müller Bau' }], 4);
  const art = (a: string) => liste.filter((b) => b.werte?.art === a);
  const w = (a: string, i = 0): Record<string, unknown> => art(a)[i]?.werte ?? {};
  assert.equal(art('anwesend').length, 2);
  assert.equal(w('anwesend').firma, 'k1');
  assert.equal(w('anwesend').personen, 3);
  assert.equal(w('anwesend', 1).text, 'Unbekannt GmbH');
  assert.equal(w('mangel').firma, 'k1');
  assert.equal(w('mangel').frist, '2026-11-27');
  assert.equal(w('aufgabe').frist, null);
  assert.deepEqual(liste.filter((b) => b.werte?.art).map((b) => b.werte?.reihe), [5, 6, 7, 8, 9]);
  assert.deepEqual(liste.find((b) => b.objekt === 'tagesbericht')?.werte, { wetter: 'sonnig', temperatur: 14 });
  assert.equal(je['Anwesende']?.neu, 2);
  // Schon eingetragenes Wetter bleibt stehen
  assert.equal(diktatBefehle(g, { ...bericht, wetter: 'regen', temperatur: 3 }, [], 0).liste.some((b) => b.objekt === 'tagesbericht'), false);
});
