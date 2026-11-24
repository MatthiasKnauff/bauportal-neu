// Befehlsprotokoll: der einzige Weg, auf dem sich Daten ändern.
import type { Modulregister } from '../kern/modul';
import { BEFEHL_ARTEN, herkunftsfelder, type Befehl, type Protokolliert, type Ueberschrieben, type Zeile } from '../kern/befehl';
import { Eingabefehler, KENNUNG as UUID, pruefeWerte, type ObjektModell, type Werte } from '../kern/modell';
import { SPERRE_PROTOKOLL, alsBenutzer, spalte, tabelle, type Absender, type Db, type Verbindung } from './db';

export class Ablehnung extends Error {}
export type { Absender };

/** Übersetzt Meldungen der Datenbank (Rechte, Eindeutigkeit) in verständliche Fehler. */
function deute(e: unknown, m: ObjektModell): never {
  const f = e as { code?: string; constraint?: string };
  if (f.code === 'BP001' || f.code === '42501') throw new Ablehnung('Dazu fehlt dir das Recht');
  if (f.code === '23505' && f.constraint === `o_${m.name}_pkey`) throw new Ablehnung(`${m.titel} gibt es schon`);
  if (f.code === 'BP002') throw new Ablehnung('Es muss mindestens eine Administratorin oder ein Administrator übrig bleiben');
  if (f.code === '23505') {
    const feld = m.felder.find((x) => f.constraint === `o_${m.name}_${x.name}_eindeutig`);
    if (feld) throw new Eingabefehler({ [feld.name]: `„${feld.titel}“ gibt es schon` });
  }
  throw e;
}

export function pruefeBefehl(roh: unknown): Befehl {
  const b = roh as Partial<Befehl> | null;
  if (!b || typeof b !== 'object') throw new Ablehnung('Befehl fehlt');
  if (typeof b.id !== 'string' || !UUID.test(b.id)) throw new Ablehnung('Befehl ohne gültige Kennung');
  if (typeof b.objektId !== 'string' || !UUID.test(b.objektId)) throw new Ablehnung('Befehl ohne gültiges Objekt');
  if (typeof b.objekt !== 'string') throw new Ablehnung('Befehl ohne Objektart');
  if (!BEFEHL_ARTEN.includes(b.art as never)) throw new Ablehnung('Unbekannter Befehl');
  const gesehen = typeof b.gesehen === 'number' && Number.isFinite(b.gesehen) ? b.gesehen : 0;
  if (b.herkunft !== undefined && (typeof b.herkunft !== 'string' || !/^[a-z_]{1,20}$/.test(b.herkunft))) throw new Ablehnung('Ungültige Herkunft');
  return { id: b.id, objekt: b.objekt, art: b.art!, objektId: b.objektId, werte: b.werte, gesehen, ...(b.herkunft ? { herkunft: b.herkunft } : {}) };
}

function ausZeile(r: Record<string, unknown>): Protokolliert {
  return {
    seq: r.seq as number, id: r.id as string, zeit: (r.zeit as Date).toISOString(),
    benutzerId: r.benutzer_id as string, benutzerName: r.benutzer_name as string,
    objekt: r.objekt as string, art: r.art as Befehl['art'], objektId: r.objekt_id as string,
    werte: (r.werte as Werte | null) ?? undefined,
    ueberschrieben: (r.ueberschrieben as Record<string, Ueberschrieben> | null) ?? undefined,
    gesehen: 0,
    ...(r.herkunft ? { herkunft: r.herkunft as string, herkunftFelder: (r.herkunft_felder as string[] | null) ?? [] } : {}),
  };
}

interface Stand { seq: number; von: string; name: string; herkunft?: string }

/**
 * Fachregeln zu einem Objekt, die über die Feldprüfung hinausgehen. Sie laufen in derselben Transaktion wie der Befehl.
 * vor: darf Werte ergänzen oder den Befehl ablehnen. nach: liefert Folgebefehle (z. B. „die anderen Versionen sind nicht mehr gültig“).
 */
export interface Regel {
  vor?: (c: Verbindung, b: Befehl, vorher: Record<string, unknown> | undefined, werte: Werte | undefined) => Promise<void>;
  nach?: (c: Verbindung, b: Befehl, vorher: Record<string, unknown> | undefined, werte: Werte | undefined) => Promise<Befehl[]>;
}
export const regeln = new Map<string, Regel>();

/**
 * Kern eines Befehls: prüfen, Daten ändern, ins Protokoll schreiben, Folgebefehle ausführen.
 * Läuft auf einer Verbindung, die schon im Namen des Benutzers arbeitet (alsBenutzer) – so lassen sich
 * mehrere Befehle zu einem Vorgang zusammenfassen, der ganz oder gar nicht wirkt.
 */
export async function fuehreAus(c: Verbindung, register: Modulregister, wer: Absender, roh: unknown): Promise<Protokolliert> {
  const b = pruefeBefehl(roh);
  const m: ObjektModell | undefined = register.modell(b.objekt);
  if (!m) throw new Ablehnung(`Unbekannte Objektart „${b.objekt}“`);
  const t = tabelle(m.name);
  const regel = regeln.get(m.name);
  if (m.einzeln && b.objektId !== m.einzeln) throw new Ablehnung(`${m.titel} gibt es nur einmal`);
  if (m.einzeln && b.art === 'loeschen') throw new Ablehnung(`${m.titel} lässt sich nicht löschen`);
    const vorher = (await c.query(`select * from ${t} where id = $1`, [b.objektId])).rows[0] as Record<string, unknown> | undefined;
    let werte: Werte | undefined;
    let ueberschrieben: Record<string, Ueberschrieben> | undefined;

    if (b.art === 'anlegen') {
      if (vorher) throw new Ablehnung(`${m.titel} gibt es schon`);
      werte = pruefeWerte(m, b.werte, true);
    } else {
      // Was der Benutzer nicht sehen darf, gibt es für ihn nicht.
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
    await regel?.vor?.(c, b, vorher, werte);
    // Herkunft gilt für das, was der Absender geliefert hat (und was nicht leer ist) – nicht für ergänzte Vorgaben
    const geliefert = new Set(Object.keys((b.werte ?? {}) as object));
    const herkunftFelder = b.herkunft && werte ? herkunftsfelder({ art: b.art, werte }).filter((k) => geliefert.has(k)) : undefined;
    const projektId = !m.projektFeld ? null : m.projektFeld === 'id' ? b.objektId : (werte?.[m.projektFeld] ?? vorher?.[m.projektFeld] ?? null);

    try {
      const p = await c.query(
        `insert into kern_befehl (id, benutzer_id, benutzer_name, objekt, art, objekt_id, werte, ueberschrieben, projekt_id, herkunft, herkunft_felder)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning seq, zeit`,
        [b.id, wer.id, wer.name, m.name, b.art, b.objektId, werte ? JSON.stringify(werte) : null, ueberschrieben ? JSON.stringify(ueberschrieben) : null, projektId, b.herkunft ?? null, herkunftFelder ?? null],
      );
      const eintrag: Protokolliert = { ...b, werte, ueberschrieben, seq: p.rows[0].seq, zeit: (p.rows[0].zeit as Date).toISOString(), benutzerId: wer.id, benutzerName: wer.name, gesehen: 0, ...(herkunftFelder ? { herkunftFelder } : {}) };

      if (b.art === 'anlegen' || b.art === 'aendern') {
        const namen = Object.keys(werte!);
        const marke: Record<string, Stand> = {};
        const mitHerkunft = herkunftFelder ? new Set(herkunftFelder) : null;
        for (const k of namen) marke[k] = { seq: eintrag.seq, von: wer.id, name: wer.name, ...(mitHerkunft?.has(k) ? { herkunft: b.herkunft } : {}) };
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
      for (const folge of (await regel?.nach?.(c, b, vorher, werte)) ?? []) await fuehreAus(c, register, wer, folge);
      return eintrag;
    } catch (e) {
      deute(e, m);
    }
}

const bekannt = (id: string) => async (c: Verbindung) => {
  // Ein Befehl nach dem anderen: so ist die Reihenfolge im Protokoll auch die Reihenfolge der Wirkung.
  await c.query('select pg_advisory_xact_lock($1)', [SPERRE_PROTOKOLL]);
  const schon = await c.query('select * from kern_befehl where id = $1', [id]);
  return schon.rows[0] ? ausZeile(schon.rows[0]) : undefined;
};

/**
 * Führt einen Befehl aus – in einer Transaktion. Ein schon bekannter Befehl (gleiche Kennung) wird nicht noch einmal ausgeführt.
 */
export async function befehlAusfuehren(db: Db, register: Modulregister, wer: Absender, roh: unknown): Promise<Protokolliert> {
  const b = pruefeBefehl(roh);
  return alsBenutzer(db, wer, (c) => fuehreAus(c, register, wer, b), bekannt(b.id));
}

/** Mehrere Befehle als ein Vorgang: alle oder keiner. Der erste Befehl trägt die Kennung des Vorgangs. */
export async function vorgangAusfuehren(db: Db, register: Modulregister, wer: Absender, befehle: Befehl[]): Promise<Protokolliert> {
  return alsBenutzer(db, wer, async (c) => {
    let erster!: Protokolliert;
    for (const [i, b] of befehle.entries()) { const p = await fuehreAus(c, register, wer, b); if (i === 0) erster = p; }
    return erster;
  }, bekannt(befehle[0]!.id));
}
export async function stand(db: Db): Promise<number> {
  return (await db.query('select coalesce(max(seq), 0) as s from kern_befehl')).rows[0].s as number;
}

/** Alle Befehle nach einem Protokollstand, in Reihenfolge – nur die, die der Benutzer sehen darf. */
export async function befehleSeit(db: Db, wer: Absender, seit: number, grenze = 5000): Promise<Protokolliert[]> {
  return alsBenutzer(db, wer, async (c) =>
    (await c.query('select * from kern_befehl where seq > $1 order by seq limit $2', [seit, grenze])).rows.map(ausZeile));
}

/** Der ganze Datenbestand auf einmal, soweit der Benutzer ihn sehen darf – für ein Gerät, das noch nichts hat. */
export async function schnappschuss(db: Db, register: Modulregister, wer: Absender): Promise<{ stand: number; objekte: Record<string, Zeile[]> }> {
  let s = 0;
  return alsBenutzer(db, wer, async (c) => {
    const objekte: Record<string, Zeile[]> = {};
    for (const m of register.alleModelle) {
      const r = await c.query(`select * from ${tabelle(m.name)}`);
      objekte[m.name] = r.rows.map((z: Record<string, unknown>) => {
        const werte: Werte = {};
        for (const f of m.felder) werte[f.name] = z[f.name] as Werte[string];
        const herkunft: Record<string, string> = {};
        for (const [k, st] of Object.entries(z._stand as Record<string, Stand>)) if (st.herkunft) herkunft[k] = st.herkunft;
        return { id: z.id as string, geloescht: z.geloescht as boolean, werte, ...(Object.keys(herkunft).length ? { herkunft } : {}) };
      });
    }
    return { stand: s, objekte };
  }, async (c) => {
    // Sperre: während des Lesens kommt kein Befehl dazu – Stand und Daten passen sicher zusammen.
    await c.query('select pg_advisory_xact_lock($1)', [SPERRE_PROTOKOLL]);
    s = (await c.query('select coalesce(max(seq), 0) as s from kern_befehl')).rows[0].s as number;
    return undefined;
  });
}
