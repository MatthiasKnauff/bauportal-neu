// Anmeldung: Kennwörter und Sitzungen. Die Benutzer selbst sind Objekte wie alle anderen
// (Modul Verwaltung) und ändern sich nur über Befehle; Kennwörter stehen nie im Protokoll.
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Eingabefehler } from '../kern/modell';
import type { Modulregister } from '../kern/modul';
import type { Rechte } from '../kern/rechte';
import { SYSTEM, alsBenutzer, type Db } from './db';
import { befehlAusfuehren } from './protokoll';
import { BUERO_ID } from '../module/verwaltung/beipackzettel';

const scryptP = promisify(scrypt) as (pw: string, salz: Buffer, laenge: number) => Promise<Buffer>;

export interface Benutzer { id: string; name: string; anmeldename: string; rolle: string }

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
const AKTIV = 'not b.gesperrt and not b.geloescht';

export async function eingerichtet(db: Db): Promise<boolean> {
  return (await db.query('select 1 from o_benutzer limit 1')).rowCount! > 0;
}

function pruefeKennwort(kennwort: unknown): string {
  const k = String(kennwort ?? '');
  if (k.length < 10) throw new Eingabefehler({ kennwort: 'Das Kennwort braucht mindestens 10 Zeichen' });
  return k;
}

export async function kennwortSetzen(db: Db, benutzerId: string, kennwort: unknown): Promise<void> {
  const k = pruefeKennwort(kennwort);
  await db.query(
    'insert into kern_kennwort (benutzer_id, kennwort) values ($1,$2) on conflict (benutzer_id) do update set kennwort = excluded.kennwort, geaendert = now()',
    [benutzerId, await hash(k)],
  );
}

export async function kennwortStimmt(db: Db, benutzerId: string, kennwort: unknown): Promise<boolean> {
  const r = await db.query('select kennwort from kern_kennwort where benutzer_id = $1', [benutzerId]);
  return !!r.rows[0] && passt(String(kennwort ?? ''), r.rows[0].kennwort);
}

export interface Einrichtung { name?: unknown; anmeldename?: unknown; kennwort?: unknown; bueroname?: unknown; bundesland?: unknown; musterprojekt?: unknown }

/**
 * Einrichtungsassistent: legt das Administrator-Konto, die Bürodaten und auf Wunsch ein Musterprojekt an –
 * nur möglich, solange es noch keinen Benutzer gibt.
 */
export async function ersteinrichtung(db: Db, register: Modulregister, e: Einrichtung): Promise<Benutzer> {
  const kennwort = pruefeKennwort(e.kennwort);
  const c = await db.connect();
  try {
    await c.query('select pg_advisory_lock(727003)');
    if (await eingerichtet(db)) throw new Eingabefehler({}, 'Das Bauportal ist schon eingerichtet');
    const id = randomUUID();
    const p = await befehlAusfuehren(db, register, SYSTEM, {
      id: randomUUID(), objekt: 'benutzer', art: 'anlegen', objektId: id, gesehen: 0,
      werte: { name: e.name, anmeldename: e.anmeldename, rolle: 'admin' },
    });
    await kennwortSetzen(db, id, kennwort);
    const ich = { id, name: String(p.werte!.name), system: true };
    const buero: Record<string, unknown> = {};
    if (String(e.bueroname ?? '').trim()) buero.name = e.bueroname;
    if (String(e.bundesland ?? '').trim()) buero.bundesland = e.bundesland;
    if (Object.keys(buero).length) {
      await befehlAusfuehren(db, register, ich, { id: randomUUID(), objekt: 'buero', art: 'aendern', objektId: BUERO_ID, werte: buero, gesehen: 0 });
    }
    if (e.musterprojekt === true) {
      const anlegen = (objekt: string, werte: Record<string, unknown>) =>
        befehlAusfuehren(db, register, ich, { id: randomUUID(), objekt, art: 'anlegen', objektId: randomUUID(), werte, gesehen: 0 });
      await anlegen('projekt', { name: 'Musterprojekt Wohnhaus', nummer: 'M-001', bauherr: 'Familie Muster', strasse: 'Musterweg 1', plz: '45127', ort: 'Essen',
        notiz: 'Ein Projekt zum Ausprobieren. Es lässt sich jederzeit löschen.' });
      await anlegen('kontakt', { name: 'Muster Rohbau GmbH', art: 'firma', gewerk: 'Rohbau', ort: 'Essen', telefon: '0201 000001', email: 'info@muster-rohbau.example' });
      await anlegen('kontakt', { name: 'Dachdeckerei Beispiel', art: 'firma', gewerk: 'Dachdecker', ort: 'Bochum', telefon: '0234 000002' });
      await anlegen('kontakt', { name: 'Bauamt Musterstadt', art: 'behoerde', ort: 'Essen', telefon: '0201 000003' });
    }
    return { id, name: ich.name, anmeldename: String(p.werte!.anmeldename), rolle: 'admin' };
  } finally {
    await c.query('select pg_advisory_unlock(727003)');
    c.release();
  }
}

export async function sitzungAnlegen(db: Db, benutzerId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.query('insert into kern_sitzung (token_hash, benutzer_id) values ($1,$2)', [tokenHash(token), benutzerId]);
  return token;
}

export async function anmelden(db: Db, anmeldename: unknown, kennwort: unknown): Promise<{ benutzer: Benutzer; token: string } | null> {
  const r = await db.query(
    `select b.id, b.name, b.anmeldename, b.rolle, k.kennwort from o_benutzer b left join kern_kennwort k on k.benutzer_id = b.id
     where b.anmeldename = $1 and ${AKTIV}`, [String(anmeldename ?? '').trim().toLowerCase()]);
  const z = r.rows[0];
  // Auch ohne Treffer rechnen, damit die Antwortzeit nichts über vorhandene Namen verrät.
  const ok = await passt(String(kennwort ?? ''), z?.kennwort ?? 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==');
  if (!z?.kennwort || !ok) return null;
  return { benutzer: { id: z.id, name: z.name, anmeldename: z.anmeldename, rolle: z.rolle }, token: await sitzungAnlegen(db, z.id) };
}

export const SITZUNG_TAGE = 30;

export async function sitzungBenutzer(db: Db, token: string | undefined): Promise<Benutzer | null> {
  if (!token) return null;
  const r = await db.query(
    `update kern_sitzung s set zuletzt = now() from o_benutzer b
     where s.token_hash = $1 and b.id = s.benutzer_id and ${AKTIV} and s.zuletzt > now() - make_interval(days => $2)
     returning b.id, b.name, b.anmeldename, b.rolle`,
    [tokenHash(token), SITZUNG_TAGE],
  );
  return (r.rows[0] as Benutzer | undefined) ?? null;
}

export async function istAktiv(db: Db, benutzerId: string): Promise<boolean> {
  return (await db.query(`select 1 from o_benutzer b where b.id = $1 and ${AKTIV}`, [benutzerId])).rowCount! > 0;
}

export async function abmelden(db: Db, token: string | undefined): Promise<void> {
  if (token) await db.query('delete from kern_sitzung where token_hash = $1', [tokenHash(token)]);
}
/** Alle anderen Sitzungen eines Benutzers beenden (nach Kennwortwechsel). */
export async function andereSitzungenBeenden(db: Db, benutzerId: string, behalten?: string): Promise<void> {
  await db.query('delete from kern_sitzung where benutzer_id = $1 and token_hash <> $2', [benutzerId, behalten ? tokenHash(behalten) : '']);
}

/** Was der Benutzer darf – für die Oberfläche (Knöpfe zeigen oder nicht). Entschieden wird in der Datenbank. */
export async function meineRechte(db: Db, register: Modulregister, wer: Benutzer): Promise<{ rechte: Rechte; projekte: string[]; sichtKennung: string }> {
  return alsBenutzer(db, wer, async (c) => {
    const r = await c.query(
      `select o, bp_darf(o, 'lesen', null) as lesen, bp_darf(o, 'schreiben', null) as schreiben, bp_darf(o, 'loeschen', null) as loeschen
       from unnest($1::text[]) as o`, [register.alleModelle.map((m) => m.name)]);
    const rechte: Rechte = {};
    for (const z of r.rows) rechte[z.o] = { lesen: z.lesen, schreiben: z.schreiben, loeschen: z.loeschen };
    const p = await c.query('select id from o_projekt order by id');
    const projekte = p.rows.map((z) => z.id as string);
    // Ändert sich diese Kennung, sieht der Benutzer anderes als bisher – sein Gerät holt dann den Bestand neu.
    const sichtKennung = createHash('sha256').update(JSON.stringify([wer.rolle, rechte, projekte])).digest('hex').slice(0, 16);
    return { rechte, projekte, sichtKennung };
  });
}
