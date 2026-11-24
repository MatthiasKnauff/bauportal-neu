// Anmeldung: Benutzer, Kennwörter, Sitzungen.
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Eingabefehler } from '../kern/modell';
import type { Db } from './db';

const scryptP = promisify(scrypt) as (pw: string, salz: Buffer, laenge: number) => Promise<Buffer>;

export interface Benutzer { id: string; name: string; anmeldename: string; rolle: 'admin' | 'mitarbeiter' }

async function hash(kennwort: string): Promise<string> {
  const salz = randomBytes(16);
  return `scrypt$${salz.toString('base64')}$${(await scryptP(kennwort, salz, 64)).toString('base64')}`;
}
async function passt(kennwort: string, gespeichert: string): Promise<boolean> {
  const [, s, h] = gespeichert.split('$');
  if (!s || !h) return false;
  const soll = Buffer.from(h, 'base64');
  return timingSafeEqual(soll, await scryptP(kennwort, Buffer.from(s, 'base64'), soll.length));
}
const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex');

export async function eingerichtet(db: Db): Promise<boolean> {
  return (await db.query('select 1 from kern_benutzer limit 1')).rowCount! > 0;
}

export async function benutzerAnlegen(db: Db, e: { name?: unknown; anmeldename?: unknown; kennwort?: unknown; rolle: Benutzer['rolle'] }): Promise<Benutzer> {
  const name = String(e.name ?? '').trim();
  const anmeldename = String(e.anmeldename ?? '').trim().toLowerCase();
  const kennwort = String(e.kennwort ?? '');
  const f: Record<string, string> = {};
  if (!name) f.name = 'Bitte einen Namen eintragen';
  if (!/^[a-z0-9._@-]{2,80}$/.test(anmeldename)) f.anmeldename = 'Anmeldename: 2–80 Zeichen, Buchstaben, Ziffern, Punkt, Bindestrich oder E-Mail-Adresse';
  if (kennwort.length < 10) f.kennwort = 'Das Kennwort braucht mindestens 10 Zeichen';
  if (Object.keys(f).length) throw new Eingabefehler(f);
  const id = randomUUID();
  const r = await db.query(
    'insert into kern_benutzer (id, name, anmeldename, kennwort, rolle) values ($1,$2,$3,$4,$5) on conflict (anmeldename) do nothing',
    [id, name, anmeldename, await hash(kennwort), e.rolle],
  );
  if (!r.rowCount) throw new Eingabefehler({ anmeldename: 'Diesen Anmeldenamen gibt es schon' });
  return { id, name, anmeldename, rolle: e.rolle };
}

/** Legt den ersten Benutzer (Administrator) an – nur möglich, solange es noch keinen gibt. */
export async function ersteinrichtung(db: Db, e: { name?: unknown; anmeldename?: unknown; kennwort?: unknown }): Promise<Benutzer> {
  const c = await db.connect();
  try {
    await c.query('select pg_advisory_lock(727003)');
    if (await eingerichtet(db)) throw new Eingabefehler({}, 'Das Bauportal ist schon eingerichtet');
    return await benutzerAnlegen(db, { ...e, rolle: 'admin' });
  } finally {
    await c.query('select pg_advisory_unlock(727003)');
    c.release();
  }
}

export async function alleBenutzer(db: Db): Promise<Benutzer[]> {
  return (await db.query('select id, name, anmeldename, rolle from kern_benutzer order by name')).rows as Benutzer[];
}

export async function sitzungAnlegen(db: Db, benutzerId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.query('insert into kern_sitzung (token_hash, benutzer_id) values ($1,$2)', [tokenHash(token), benutzerId]);
  return token;
}

export async function anmelden(db: Db, anmeldename: unknown, kennwort: unknown): Promise<{ benutzer: Benutzer; token: string } | null> {
  const r = await db.query('select * from kern_benutzer where anmeldename = $1', [String(anmeldename ?? '').trim().toLowerCase()]);
  const z = r.rows[0];
  // Auch ohne Treffer rechnen, damit die Antwortzeit nichts über vorhandene Namen verrät.
  const ok = await passt(String(kennwort ?? ''), z?.kennwort ?? 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==');
  if (!z || !ok) return null;
  return { benutzer: { id: z.id, name: z.name, anmeldename: z.anmeldename, rolle: z.rolle }, token: await sitzungAnlegen(db, z.id) };
}

export const SITZUNG_TAGE = 30;

export async function sitzungBenutzer(db: Db, token: string | undefined): Promise<Benutzer | null> {
  if (!token) return null;
  const r = await db.query(
    `update kern_sitzung s set zuletzt = now() from kern_benutzer b
     where s.token_hash = $1 and b.id = s.benutzer_id and s.zuletzt > now() - make_interval(days => $2)
     returning b.id, b.name, b.anmeldename, b.rolle`,
    [tokenHash(token), SITZUNG_TAGE],
  );
  return (r.rows[0] as Benutzer | undefined) ?? null;
}

export async function abmelden(db: Db, token: string | undefined): Promise<void> {
  if (token) await db.query('delete from kern_sitzung where token_hash = $1', [tokenHash(token)]);
}
