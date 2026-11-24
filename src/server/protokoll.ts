// Befehlsprotokoll: der einzige Weg, auf dem sich Daten ändern.
import type { Modulregister } from '../kern/modul';
import { BEFEHL_ARTEN, type Befehl, type Protokolliert, type Ueberschrieben, type Zeile } from '../kern/befehl';
import { pruefeWerte, type ObjektModell, type Werte } from '../kern/modell';
import { SPERRE_PROTOKOLL, spalte, tabelle, type Db } from './db';

export class Ablehnung extends Error {}

export interface Absender { id: string; name: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pruefeBefehl(roh: unknown): Befehl {
  const b = roh as Partial<Befehl> | null;
  if (!b || typeof b !== 'object') throw new Ablehnung('Befehl fehlt');
  if (typeof b.id !== 'string' || !UUID.test(b.id)) throw new Ablehnung('Befehl ohne gültige Kennung');
  if (typeof b.objektId !== 'string' || !UUID.test(b.objektId)) throw new Ablehnung('Befehl ohne gültiges Objekt');
  if (typeof b.objekt !== 'string') throw new Ablehnung('Befehl ohne Objektart');
  if (!BEFEHL_ARTEN.includes(b.art as never)) throw new Ablehnung('Unbekannter Befehl');
  const gesehen = typeof b.gesehen === 'number' && Number.isFinite(b.gesehen) ? b.gesehen : 0;
  return { id: b.id, objekt: b.objekt, art: b.art!, objektId: b.objektId, werte: b.werte, gesehen };
}

function ausZeile(r: Record<string, unknown>): Protokolliert {
  return {
    seq: r.seq as number, id: r.id as string, zeit: (r.zeit as Date).toISOString(),
    benutzerId: r.benutzer_id as string, benutzerName: r.benutzer_name as string,
    objekt: r.objekt as string, art: r.art as Befehl['art'], objektId: r.objekt_id as string,
    werte: (r.werte as Werte | null) ?? undefined,
    ueberschrieben: (r.ueberschrieben as Record<string, Ueberschrieben> | null) ?? undefined,
    gesehen: 0,
  };
}

interface Stand { seq: number; von: string; name: string }

/**
 * Führt einen Befehl aus: prüfen, Daten ändern, ins Protokoll schreiben – alles in einer Transaktion.
 * Ein schon bekannter Befehl (gleiche Kennung) wird nicht noch einmal ausgeführt.
 */
export async function befehlAusfuehren(db: Db, register: Modulregister, wer: Absender, roh: unknown): Promise<Protokolliert> {
  const b = pruefeBefehl(roh);
  const m: ObjektModell | undefined = register.modell(b.objekt);
  if (!m) throw new Ablehnung(`Unbekannte Objektart „${b.objekt}“`);
  const t = tabelle(m.name);
  const c = await db.connect();
  try {
    await c.query('begin');
    // Ein Befehl nach dem anderen: so ist die Reihenfolge im Protokoll auch die Reihenfolge der Wirkung.
    await c.query('select pg_advisory_xact_lock($1)', [SPERRE_PROTOKOLL]);
    const schon = await c.query('select * from kern_befehl where id = $1', [b.id]);
    if (schon.rows[0]) { await c.query('commit'); return ausZeile(schon.rows[0]); }

    const vorher = (await c.query(`select * from ${t} where id = $1`, [b.objektId])).rows[0] as Record<string, unknown> | undefined;
    let werte: Werte | undefined;
    let ueberschrieben: Record<string, Ueberschrieben> | undefined;

    if (b.art === 'anlegen') {
      if (vorher) throw new Ablehnung(`${m.titel} gibt es schon`);
      werte = pruefeWerte(m, b.werte, true);
    } else {
      if (!vorher) throw new Ablehnung(`${m.titel} gibt es nicht (mehr)`);
      if (b.art === 'aendern') {
        werte = pruefeWerte(m, b.werte, false);
        const stand = vorher._stand as Record<string, Stand>;
        for (const k of Object.keys(werte)) {
          const s = stand[k];
          if (s && s.seq > b.gesehen && s.von !== wer.id && vorher[k] !== werte[k]) {
            (ueberschrieben ??= {})[k] = { wert: vorher[k] as Werte[string], von: s.name, vonId: s.von };
          }
        }
      }
    }

    const p = await c.query(
      `insert into kern_befehl (id, benutzer_id, benutzer_name, objekt, art, objekt_id, werte, ueberschrieben)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [b.id, wer.id, wer.name, m.name, b.art, b.objektId, werte ? JSON.stringify(werte) : null, ueberschrieben ? JSON.stringify(ueberschrieben) : null],
    );
    const eintrag = ausZeile(p.rows[0]);

    if (b.art === 'anlegen' || b.art === 'aendern') {
      const namen = Object.keys(werte!);
      const marke: Record<string, Stand> = {};
      for (const k of namen) marke[k] = { seq: eintrag.seq, von: wer.id, name: wer.name };
      if (b.art === 'anlegen') {
        const sp = ['id', '_stand', ...namen.map(spalte)];
        const pl = sp.map((_, i) => `$${i + 1}`);
        await c.query(`insert into ${t} (${sp.join(',')}) values (${pl.join(',')})`, [b.objektId, JSON.stringify(marke), ...namen.map((k) => werte![k])]);
      } else if (namen.length) {
        const set = namen.map((k, i) => `${spalte(k)} = $${i + 3}`);
        await c.query(`update ${t} set _stand = _stand || $2::jsonb, ${set.join(',')} where id = $1`, [b.objektId, JSON.stringify(marke), ...namen.map((k) => werte![k])]);
      }
    } else {
      await c.query(`update ${t} set geloescht = $2 where id = $1`, [b.objektId, b.art === 'loeschen']);
    }
    await c.query('commit');
    return eintrag;
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}

export async function stand(db: Db): Promise<number> {
  return (await db.query('select coalesce(max(seq), 0) as s from kern_befehl')).rows[0].s as number;
}

/** Alle Befehle nach einem Protokollstand, in Reihenfolge. */
export async function befehleSeit(db: Db, seit: number, grenze = 5000): Promise<Protokolliert[]> {
  const r = await db.query('select * from kern_befehl where seq > $1 order by seq limit $2', [seit, grenze]);
  return r.rows.map(ausZeile);
}

/** Der ganze Datenbestand auf einmal – für ein Gerät, das noch nichts hat. */
export async function schnappschuss(db: Db, register: Modulregister): Promise<{ stand: number; objekte: Record<string, Zeile[]> }> {
  const c = await db.connect();
  try {
    await c.query('begin isolation level repeatable read read only');
    const s = (await c.query('select coalesce(max(seq), 0) as s from kern_befehl')).rows[0].s as number;
    const objekte: Record<string, Zeile[]> = {};
    for (const m of register.alleModelle) {
      const r = await c.query(`select * from ${tabelle(m.name)}`);
      objekte[m.name] = r.rows.map((z: Record<string, unknown>) => {
        const werte: Werte = {};
        for (const f of m.felder) werte[f.name] = z[f.name] as Werte[string];
        return { id: z.id as string, geloescht: z.geloescht as boolean, werte };
      });
    }
    await c.query('commit');
    return { stand: s, objekte };
  } finally {
    c.release();
  }
}
