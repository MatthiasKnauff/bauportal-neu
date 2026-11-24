// Datenbank: Verbindung und Schema. Die Tabellen der Objekte entstehen aus dem Datenmodell.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import type { Modulregister } from '../kern/modul';
import type { Feld } from '../kern/modell';

pg.types.setTypeParser(20, Number);     // bigint  -> Zahl (Protokollnummern)
pg.types.setTypeParser(1700, Number);   // numeric -> Zahl

export type Db = pg.Pool;
export type Verbindung = pg.PoolClient;

export function verbinden(url: string): Db {
  return new pg.Pool({ connectionString: url, max: 10 });
}

/** Wartet, bis die Datenbank erreichbar ist (beim Start des Containers ist sie evtl. noch nicht so weit). */
export async function warteAufDb(db: Db, versuche = 60): Promise<void> {
  for (let i = 1; ; i++) {
    try { await db.query('select 1'); return; }
    catch (e) {
      if (i >= versuche) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

export const tabelle = (objekt: string) => `"o_${objekt}"`;
export const spalte = (feld: string) => `"${feld}"`;

function spaltentyp(f: Feld): string {
  if (f.art === 'zahl') return 'numeric';
  if (f.art === 'ja_nein') return 'boolean not null default false';
  return "text not null default ''";
}

export const SPERRE_SCHEMA = 727001;
export const SPERRE_PROTOKOLL = 727002;

export async function schemaAnlegen(db: Db, register: Modulregister): Promise<void> {
  const c = await db.connect();
  try {
    await c.query('begin');
    await c.query('select pg_advisory_xact_lock($1)', [SPERRE_SCHEMA]);
    await c.query(`
      create table if not exists kern_meta (schluessel text primary key, wert text not null);
      create table if not exists kern_benutzer (
        id uuid primary key,
        name text not null,
        anmeldename text not null unique,
        kennwort text not null,
        rolle text not null default 'mitarbeiter',
        erstellt timestamptz not null default now()
      );
      create table if not exists kern_sitzung (
        token_hash text primary key,
        benutzer_id uuid not null references kern_benutzer(id) on delete cascade,
        erstellt timestamptz not null default now(),
        zuletzt timestamptz not null default now()
      );
      create table if not exists kern_befehl (
        seq bigserial primary key,
        id uuid not null unique,
        zeit timestamptz not null default now(),
        benutzer_id uuid not null,
        benutzer_name text not null,
        objekt text not null,
        art text not null,
        objekt_id uuid not null,
        werte jsonb,
        ueberschrieben jsonb
      );
      create index if not exists kern_befehl_objekt on kern_befehl (objekt, objekt_id);
    `);
    await c.query('insert into kern_meta values ($1, $2) on conflict do nothing', ['kennung', randomUUID()]);
    for (const m of register.alleModelle) {
      await c.query(`create table if not exists ${tabelle(m.name)} (
        id uuid primary key,
        geloescht boolean not null default false,
        _stand jsonb not null default '{}'
      )`);
      for (const f of m.felder) {
        await c.query(`alter table ${tabelle(m.name)} add column if not exists ${spalte(f.name)} ${spaltentyp(f)}`);
      }
    }
    await c.query('commit');
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}

export async function kennung(db: Db): Promise<string> {
  const r = await db.query("select wert from kern_meta where schluessel = 'kennung'");
  return r.rows[0].wert as string;
}
