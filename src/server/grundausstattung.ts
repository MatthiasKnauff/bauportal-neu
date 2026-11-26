// Grundausstattung: was nach dem Anlegen des Schemas als Daten da sein muss –
// die Rechte ab Werk (aus den Beipackzetteln), die Bürodaten und die Übernahme älterer Stände.
import { createHash, randomUUID } from 'node:crypto';
import type { Modulregister } from '../kern/modul';
import { ROLLEN } from '../kern/rechte';
import { SYSTEM, type Db } from './db';
import { befehlAusfuehren, ALLES_GESEHEN } from './protokoll';
import { ABLAGE_ID, BUERO_ID } from '../module/verwaltung/beipackzettel';
import { VORINSTALLIERT } from '../kern/design';

/** Aus einem Text immer dieselbe Kennung – so entsteht ein Eintrag auch bei mehreren Starts nur einmal. */
export function festeKennung(text: string): string {
  const h = createHash('sha1').update('bauportal:' + text).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function grundausstattung(db: Db, register: Modulregister): Promise<void> {
  const system = (objekt: string, objektId: string, werte: Record<string, unknown>) =>
    befehlAusfuehren(db, register, SYSTEM, { id: randomUUID(), objekt, art: 'anlegen', objektId, werte, gesehen: ALLES_GESEHEN });

  // Benutzer aus dem ersten Stand (Tabelle kern_benutzer) werden zu Objekten; Kennwörter ziehen mit um.
  const alt = await db.query("select to_regclass('kern_benutzer') as t");
  if (alt.rows[0].t) {
    const benutzer = await db.query("select * from kern_benutzer order by (rolle = 'admin') desc, erstellt");
    for (const b of benutzer.rows) {
      if ((await db.query('select 1 from o_benutzer where id = $1', [b.id])).rowCount) continue;
      await system('benutzer', b.id, { name: b.name, anmeldename: b.anmeldename, rolle: b.rolle === 'admin' ? 'admin' : 'mitarbeiter' });
      await db.query('insert into kern_kennwort (benutzer_id, kennwort) values ($1,$2) on conflict do nothing', [b.id, b.kennwort]);
    }
    await db.query('drop table kern_benutzer');
  }

  // Rechte ab Werk: je Rolle und Objekt ein Eintrag. Vorhandene (vom Büro geänderte) bleiben, wie sie sind.
  const da = new Set((await db.query('select id from o_recht')).rows.map((z) => z.id as string));
  for (const m of register.alleModelle) {
    for (const r of ROLLEN) {
      if (r.name === 'admin') continue;   // darf immer alles
      const id = festeKennung(`recht:${r.name}:${m.name}`);
      if (da.has(id)) continue;
      await system('recht', id, { rolle: r.name, objekt: m.name, lesen: m.rechte.lesen.includes(r.name), schreiben: m.rechte.schreiben.includes(r.name), loeschen: m.rechte.loeschen.includes(r.name) });
    }
  }
  if (!(await db.query('select 1 from o_buero where id = $1', [BUERO_ID])).rowCount) await system('buero', BUERO_ID, {});
  if (!(await db.query('select 1 from o_ablage where id = $1', [ABLAGE_ID])).rowCount) await system('ablage', ABLAGE_ID, {});
  // Vorinstallierte Designs (die Farbschemen des bisherigen Bauportals): je einmal; was das Büro gelöscht oder geändert hat, bleibt so
  for (const v of VORINSTALLIERT) {
    const id = festeKennung(`design:${v.schluessel}`);
    if ((await db.query('select 1 from o_design where id = $1', [id])).rowCount) continue;
    await system('design', id, { name: v.name, hell: JSON.stringify(v.design.hell), dunkel: JSON.stringify(v.design.dunkel), quelle: 'vorinstalliert', gruppe: v.gruppe, beschreibung: v.beschreibung });
  }
}
