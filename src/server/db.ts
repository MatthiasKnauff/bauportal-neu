// Datenbank: Verbindung und Schema. Die Tabellen der Objekte entstehen aus dem Datenmodell.
// Auch die Rechte sitzen hier: Die Datenbank selbst lässt nur durch, was die Rolle darf.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import type { Modulregister } from '../kern/modul';
import type { Feld } from '../kern/modell';
import { ROLLEN } from '../kern/rechte';

pg.types.setTypeParser(20, Number);     // bigint  -> Zahl (Protokollnummern)
pg.types.setTypeParser(1700, Number);   // numeric -> Zahl

export type Db = pg.Pool;
export type Verbindung = pg.PoolClient;

export function verbinden(url: string): Db {
  // Verbindungen zur Datenbank: einstellbar (DB_VERBINDUNGEN), Vorgabe 20 – gemessen mit tests/ui/last.mjs
  const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DB_VERBINDUNGEN) || 20 });
  // Bricht eine ruhende Verbindung ab (Neustart der Datenbank, Verbindung gekappt), meldet der Pool das als Ereignis –
  // ohne Empfänger beendet das den ganzen Server. Die Verbindung ist dann schon verworfen; laufende Abfragen bekommen
  // ihren Fehler wie immer, die nächste holt sich eine neue Verbindung.
  pool.on('error', (e) => console.warn(`Datenbankverbindung abgebrochen: ${e.message}`));
  return pool;
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
  if (f.art === 'verweis') return 'uuid';   // datum: Text JJJJ-MM-TT, sortiert richtig und bleibt ohne Zeitzone
  if (f.erbt) return f.art === 'ja_nein' ? 'boolean' : 'text';   // leer (null) = geerbt (kern/erben.ts)
  if (f.art === 'ja_nein') return 'boolean not null default false';
  return "text not null default ''";
}

export const SPERRE_SCHEMA = 727001;
export const SPERRE_PROTOKOLL = 727002;

/** Wer gerade handelt. system = das Programm selbst (Einrichtung, Grundausstattung) – ohne Rechteprüfung. */
export interface Absender { id: string; name: string; system?: boolean }
export const SYSTEM: Absender = { id: '00000000-0000-4000-8000-000000000000', name: 'System', system: true };

/**
 * Führt etwas im Namen eines Benutzers aus. Die Verbindung wechselt dafür in die Datenbankrolle
 * „bp_nutzer“, für die die Rechte-Regeln der Tabellen gelten.
 */
export async function alsBenutzer<T>(db: Db, wer: Absender, tun: (c: Verbindung) => Promise<T>, vorher?: (c: Verbindung) => Promise<T | undefined>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query('begin');
    const frueh = vorher && await vorher(c);
    if (frueh !== undefined) { await c.query('commit'); return frueh; }
    if (wer.system) await c.query("select set_config('bp.system', 'an', true)");
    else {
      await c.query('set local role bp_nutzer');
      await c.query("select set_config('bp.benutzer', $1, true)", [wer.id]);
    }
    const r = await tun(c);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}

const RECHTE_SQL = `
create or replace function bp_ich() returns uuid language sql stable as $f$
  select nullif(current_setting('bp.benutzer', true), '')::uuid $f$;

-- Rolle des handelnden Benutzers; gesperrte und gelöschte Benutzer haben keine.
create or replace function bp_rolle() returns text language sql stable security definer set search_path = public as $f$
  select rolle from o_benutzer where id = bp_ich() and not gesperrt and not geloescht $f$;

create or replace function bp_alle_projekte() returns boolean language sql stable as $f$
  select coalesce(bp_rolle() in (${ROLLEN.filter((r) => r.alleProjekte).map((r) => `'${r.name}'`).join(',')}), false) $f$;

-- Die eine Stelle, die entscheidet: Darf der Benutzer das? p = Projekt, zu dem das Objekt gehört (oder null).
create or replace function bp_darf(obj text, art text, p uuid) returns boolean language sql stable security definer set search_path = public as $f$
  select case
    when bp_rolle() is null then false
    when bp_rolle() = 'admin' then true
    else exists (select 1 from o_recht r where r.rolle = bp_rolle() and r.objekt = obj and not r.geloescht
           and case art when 'lesen' then r.lesen when 'schreiben' then r.schreiben else r.loeschen end)
      and (p is null or bp_alle_projekte()
           or exists (select 1 from o_projekt_mitglied m where m.projekt = p and m.benutzer = bp_ich() and not m.geloescht))
  end $f$;

-- Projekte, in denen der Benutzer Mitglied ist – für die Leseregeln (einmal je Abfrage, nicht je Zeile)
create or replace function bp_meine_projekte() returns setof uuid language sql stable security definer set search_path = public as $f$
  select projekt from o_projekt_mitglied where benutzer = bp_ich() and not geloescht $f$;

-- Prüft jede Änderung an einem Objekt. Argumente: Objektname, Projektfeld.
create or replace function bp_pruefe() returns trigger language plpgsql as $f$
declare
  obj text := tg_argv[0];
  pf text := tg_argv[1];
  ef text := coalesce(tg_argv[2], '');   -- Feld mit dem Benutzer, dem der Eintrag gehört (oder leer)
  p uuid;
  neu jsonb := to_jsonb(new);
begin
  if current_setting('bp.system', true) = 'an' then return new; end if;
  if pf <> '' then p := (neu->>pf)::uuid; end if;
  if ef <> '' and (neu->>ef)::uuid is distinct from bp_ich() then raise exception 'kein Recht' using errcode = 'BP001'; end if;
  if obj in ('benutzer', 'recht') and coalesce(bp_rolle(), '') <> 'admin' then
    raise exception 'kein Recht' using errcode = 'BP001';
  end if;
  if tg_op = 'INSERT' then
    if obj = 'projekt' then
      if not bp_alle_projekte() then raise exception 'kein Recht' using errcode = 'BP001'; end if;
      p := null;
    end if;
    if not bp_darf(obj, 'schreiben', p) then raise exception 'kein Recht' using errcode = 'BP001'; end if;
  else
    if new.geloescht is distinct from old.geloescht and not bp_darf(obj, 'loeschen', p) then
      raise exception 'kein Recht' using errcode = 'BP001';
    end if;
    if (neu - 'geloescht' - '_stand') is distinct from (to_jsonb(old) - 'geloescht' - '_stand') and not bp_darf(obj, 'schreiben', p) then
      raise exception 'kein Recht' using errcode = 'BP001';
    end if;
  end if;
  return new;
end $f$;

-- Es muss immer jemand übrig bleiben, der alles darf.
create or replace function bp_admin_bleibt() returns trigger language plpgsql security definer set search_path = public as $f$
begin
  if exists (select 1 from o_benutzer where not geloescht)
     and not exists (select 1 from o_benutzer where rolle = 'admin' and not gesperrt and not geloescht) then
    raise exception 'kein Admin mehr' using errcode = 'BP002';
  end if;
  return null;
end $f$;
`;

export async function schemaAnlegen(db: Db, register: Modulregister): Promise<void> {
  const c = await db.connect();
  try {
    await c.query('begin');
    await c.query('select pg_advisory_xact_lock($1)', [SPERRE_SCHEMA]);
    await c.query(`do $$ begin create role bp_nutzer nologin; exception when duplicate_object then null; end $$`);
    await c.query(`
      create table if not exists kern_meta (schluessel text primary key, wert text not null);
      create table if not exists kern_geheimnis (name text primary key, wert text not null, geaendert timestamptz not null default now());
      create table if not exists kern_ki_ausgang (
        id bigserial primary key, zeit timestamptz not null default now(), benutzer_id uuid not null, benutzer_name text not null,
        anbindung text not null, art text not null, modell text not null, aufgabe text not null, extern boolean not null,
        zeichen int not null, ersetzt int not null, tokens_ein int not null default 0, tokens_aus int not null default 0, fehler text
      );
      create table if not exists kern_katalog (id text primary key, version int not null, stand text not null, eingespielt timestamptz not null default now());
      -- Große Kataloge zum Nachschlagen (Positionsdatenbank …): nur am Server, Volltextsuche deutsch, Gliederung als Pfad
      create table if not exists kern_nachschlag (name text not null, schluessel text not null, reihe int not null, pfad text[] not null, werte jsonb not null, such tsvector not null, primary key (name, schluessel));
      create index if not exists kern_nachschlag_such on kern_nachschlag using gin (such);
      create index if not exists kern_nachschlag_pfad on kern_nachschlag (name, pfad, reihe);
      create table if not exists kern_altbild (datei text primary key, bericht text not null, beschriftung text not null default '', reihe int not null default 0, foto uuid);
      create table if not exists kern_vorschau (id uuid primary key, bild bytea not null, erstellt timestamptz not null default now());
      create table if not exists kern_logo (id int primary key, bild bytea not null, geaendert timestamptz not null default now());
      create table if not exists kern_schrift (familie text primary key, css text not null, geholt timestamptz not null default now());
      create table if not exists kern_schriftdatei (id uuid primary key, familie text not null, daten bytea not null);
      create table if not exists kern_kennwort (benutzer_id uuid primary key, kennwort text not null, geaendert timestamptz not null default now());
      create table if not exists kern_sitzung (
        token_hash text primary key,
        benutzer_id uuid not null,
        erstellt timestamptz not null default now(),
        zuletzt timestamptz not null default now()
      );
      alter table kern_sitzung drop constraint if exists kern_sitzung_benutzer_id_fkey;
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
      alter table kern_ki_ausgang add column if not exists anbindung_id uuid;
      create index if not exists kern_ki_ausgang_anbindung on kern_ki_ausgang (anbindung_id, zeit);
      alter table kern_befehl add column if not exists projekt_id uuid;
      alter table kern_befehl add column if not exists herkunft text;
      alter table kern_befehl add column if not exists herkunft_felder text[];
      create index if not exists kern_befehl_objekt on kern_befehl (objekt, objekt_id);
      create index if not exists kern_befehl_projekt on kern_befehl (projekt_id, seq);   -- Abgleich je Projekt
    `);
    await c.query('insert into kern_meta values ($1, $2) on conflict do nothing', ['kennung', randomUUID()]);
    for (const m of register.alleModelle) {
      const t = tabelle(m.name);
      await c.query(`create table if not exists ${t} (
        id uuid primary key,
        geloescht boolean not null default false,
        _stand jsonb not null default '{}'
      )`);
      for (const f of m.felder) {
        await c.query(`alter table ${t} add column if not exists ${spalte(f.name)} ${spaltentyp(f)}`);
        // Feld erbt jetzt (vorher mit Vorgabe): leer heißt dann „wie darüber“ – die Spalte darf leer sein, '' wird zu leer
        if (f.erbt && f.art !== 'zahl') await c.query(`alter table ${t} alter column ${spalte(f.name)} drop not null, alter column ${spalte(f.name)} drop default`);
        if (f.erbt && f.art !== 'zahl' && f.art !== 'ja_nein') await c.query(`update ${t} set ${spalte(f.name)} = null where ${spalte(f.name)} = ''`);
        if (f.eindeutig) await c.query(`create unique index if not exists "o_${m.name}_${f.name}_eindeutig" on ${t} (${spalte(f.name)}) where not geloescht`);
        // Jeder Verweis bekommt seinen Index – aus dem Datenmodell, damit keiner vergessen wird (Joins, „alle zu dieser Version“, Rechte je Projekt)
        if (f.art === 'verweis') await c.query(`create index if not exists "o_${m.name}_${f.name}_verweis" on ${t} (${spalte(f.name)})`);
      }
    }
    // Rechteprüfung je Zeile fragt „ist der Benutzer Mitglied dieses Projekts?“ – mit diesem Index ohne Tabellensuche
    await c.query('create index if not exists o_projekt_mitglied_wer on o_projekt_mitglied (benutzer, projekt) where not geloescht');
    // Umstellung 25.11.2026: der Aufbau eines Bauteils ist jetzt ein eigenes Objekt; der bisherige Text heißt „Material laut Plan“
    await c.query(`do $u$ begin
      if exists (select 1 from information_schema.columns where table_name = 'o_bauteil' and column_name = 'aufbau' and data_type = 'text') then
        alter table o_bauteil drop column if exists material; alter table o_bauteil rename column aufbau to material;
        alter table o_bauteil add column aufbau uuid;
        update o_bauteil set _stand = (_stand - 'aufbau') || jsonb_build_object('material', _stand->'aufbau') where _stand ? 'aufbau';
      end if; end $u$`);
    // Umstellung 26.11.2026: der Fotos-Unterordner ist fest „Bautagebuch/Fotos“ – die Einstellung entfällt
    await c.query(`alter table o_ablage drop column if exists fotos_ordner; update o_ablage set _stand = _stand - 'fotos_ordner' where _stand ? 'fotos_ordner'`);
    // Umstellung 24.11.2026: Gebäudeart und Maßnahme haben die Auswahl des Assistenten bekommen – alte Werte auf die neuen
    await c.query(`update o_gebaeude set nutzung = '' where nutzung = 'wohnen';
      update o_gebaeude set massnahme = 'kernsanierung' where massnahme = 'sanierung';
      update o_gebaeude set massnahme = 'anbau' where massnahme = 'erweiterung'`);
    // Rechte: Funktionen, Leseregeln und Prüfung je Tabelle
    await c.query(RECHTE_SQL);
    for (const m of register.alleModelle) {
      const t = tabelle(m.name);
      const p = m.projektFeld ? spalte(m.projektFeld) : 'null';
      const eigen = m.eigenFeld ? ` and ${spalte(m.eigenFeld)} = (select bp_ich())` : '';   // nur die eigenen Einträge
      // Leseregel: dieselbe Entscheidung wie bp_darf, aber so geschrieben, dass Postgres sie EINMAL je Abfrage rechnet
      // (Unterabfragen als InitPlan) – vorher lief bp_darf für jede Zeile (2000 Kontakte: 120 ms statt wenigen ms).
      const lesen = `(select bp_darf('${m.name}', 'lesen', null))` + (m.projektFeld ? ` and (${p} is null or (select bp_alle_projekte()) or ${p} in (select bp_meine_projekte()))` : '') + eigen;
      await c.query(`
        alter table ${t} enable row level security;
        drop policy if exists lesen on ${t};
        create policy lesen on ${t} for select using (${lesen});
        drop policy if exists anlegen on ${t};
        create policy anlegen on ${t} for insert with check (true);
        drop policy if exists aendern on ${t};
        create policy aendern on ${t} for update using (${lesen});
        drop trigger if exists pruefe on ${t};
        create trigger pruefe before insert or update on ${t} for each row execute function bp_pruefe('${m.name}', '${m.projektFeld ?? ''}', '${m.eigenFeld ?? ''}');
        grant select, insert, update on ${t} to bp_nutzer;
      `);
    }
    await c.query(`
      drop trigger if exists admin_bleibt on o_benutzer;
      create trigger admin_bleibt after insert or update on o_benutzer for each statement execute function bp_admin_bleibt();
      alter table kern_befehl enable row level security;
      drop policy if exists lesen on kern_befehl;
      create policy lesen on kern_befehl for select using (bp_darf(objekt, 'lesen', projekt_id) and (objekt not in (${['', ...register.alleModelle.filter((m) => m.eigenFeld).map((m) => m.name)].map((n) => `'${n}'`).join(',')}) or benutzer_id = bp_ich()));
      drop policy if exists anlegen on kern_befehl;
      create policy anlegen on kern_befehl for insert with check (true);
      grant select, insert on kern_befehl to bp_nutzer;
      grant usage on sequence kern_befehl_seq_seq to bp_nutzer;
    `);
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
