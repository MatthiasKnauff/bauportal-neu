// Versionen im Kern: gelten für alle Module gleich.
// Je Projekt und Bereich (z. B. „bauzeitenplan“) gibt es beliebig viele benannte Versionen; genau eine ist gültig.
import { randomUUID } from 'node:crypto';
import type { Modulregister } from '../kern/modul';
import type { Befehl, Protokolliert } from '../kern/befehl';
import { Eingabefehler, KENNUNG, type Werte } from '../kern/modell';
import { tabelle, type Absender, type Db } from './db';
import { Ablehnung, regelAnmelden, vorgangAusfuehren } from './protokoll';
import { alsBenutzer } from './db';

// Folgebefehle des Kerns („die anderen sind nicht mehr gültig“) dürfen, was ein Benutzer direkt nicht darf.
const folgebefehle = new Set<string>();

export function versionsregelnAnmelden(register: Modulregister): void {
  regelAnmelden('version', 'versionen', {
    async vor(c, b, vorher, werte) {
      if (b.art === 'anlegen') {
        if (!register.versionsbereiche.some((v) => v.bereich === werte!.bereich)) throw new Ablehnung(`Unbekannter Versionsbereich „${werte!.bereich}“`);
        // Die erste Version eines Bereichs ist von selbst die gültige.
        const da = await c.query('select 1 from o_version where projekt = $1 and bereich = $2 and gueltig and not geloescht', [werte!.projekt, werte!.bereich]);
        werte!.gueltig = !da.rowCount;
      } else if (b.art === 'aendern') {
        if (werte && ('projekt' in werte || 'bereich' in werte)) throw new Ablehnung('Projekt und Bereich einer Version lassen sich nicht ändern');
        if (werte?.gueltig === false && vorher!.gueltig && !folgebefehle.delete(b.id)) throw new Ablehnung('Bitte stattdessen eine andere Version gültig machen – eine ist immer gültig');
      } else if (b.art === 'loeschen' && vorher!.gueltig) {
        throw new Ablehnung('Die gültige Version lässt sich nicht löschen. Bitte erst eine andere gültig machen.');
      } else if (b.art === 'wiederherstellen') {
        throw new Ablehnung('Eine gelöschte Version lässt sich hier nicht wiederherstellen');
      }
    },
    async nach(c, b, vorher, werte) {
      // Wird eine Version gültig, sind es die anderen desselben Projekts und Bereichs nicht mehr.
      if (b.art !== 'aendern' || werte?.gueltig !== true || vorher!.gueltig) return [];
      const andere = await c.query('select id from o_version where projekt = $1 and bereich = $2 and gueltig and id <> $3', [vorher!.projekt, vorher!.bereich, b.objektId]);
      return andere.rows.map((z): Befehl => {
        const id = randomUUID();
        folgebefehle.add(id);
        return { id, objekt: 'version', art: 'aendern', objektId: z.id, werte: { gueltig: false }, gesehen: b.gesehen };
      });
    },
  });
  // Objekte, die zu einer Version gehören: die Version muss es geben und zum selben Projekt und Bereich gehören.
  for (const m of register.alleModelle.filter((x) => x.versionsBereich)) {
    regelAnmelden(m.name, 'version', {
      async vor(c, b, _vorher, werte) {
        if (b.art !== 'anlegen' && !(werte && 'version' in werte)) return;
        const v = (await c.query('select projekt, bereich from o_version where id = $1 and not geloescht', [werte!.version])).rows[0];
        if (!v || v.bereich !== m.versionsBereich) throw new Ablehnung('Die Version gibt es nicht (mehr)');
        if (m.projektFeld && b.art === 'anlegen' && werte![m.projektFeld] !== v.projekt) throw new Ablehnung('Version und Projekt passen nicht zusammen');
      },
    });
  }
}

/**
 * Neue Version als Kopie: aus einer Version desselben Projekts oder eines anderen Projekts (bewährter Plan als Vorlage).
 * Alles in einem Vorgang – ganz oder gar nicht. Verweise zwischen den kopierten Einträgen zeigen danach auf die Kopien.
 */
export async function versionKopieren(db: Db, register: Modulregister, wer: Absender, e: { vorgang?: unknown; quelle?: unknown; projekt?: unknown; name?: unknown; versionId?: unknown }): Promise<Protokolliert> {
  for (const k of ['vorgang', 'quelle', 'projekt', 'versionId'] as const) if (typeof e[k] !== 'string' || !KENNUNG.test(e[k] as string)) throw new Ablehnung(`Angabe „${k}“ fehlt`);
  const name = String(e.name ?? '').trim();
  if (!name) throw new Eingabefehler({ name: 'Bitte einen Namen für die Version eintragen' });
  const befehle = await alsBenutzer(db, wer, async (c) => {
    const quelle = (await c.query('select * from o_version where id = $1 and not geloescht', [e.quelle])).rows[0];
    if (!quelle) throw new Ablehnung('Die Vorlage gibt es nicht (mehr)');
    const neu = e.versionId as string;
    const liste: Befehl[] = [{ id: e.vorgang as string, objekt: 'version', art: 'anlegen', objektId: neu, gesehen: 0, werte: { projekt: e.projekt as string, bereich: quelle.bereich, name } }];
    const modelle = register.alleModelle.filter((m) => m.versionsBereich === quelle.bereich);
    const kopien = new Map<string, string>();
    const zeilen: { m: (typeof modelle)[number]; z: Record<string, unknown> }[] = [];
    for (const m of modelle) for (const z of (await c.query(`select * from ${tabelle(m.name)} where version = $1 and not geloescht`, [e.quelle])).rows) {
      kopien.set(z.id, randomUUID()); zeilen.push({ m, z });
    }
    for (const { m, z } of zeilen) {
      const werte: Werte = {};
      for (const f of m.felder) {
        const w = z[f.name] as Werte[string];
        werte[f.name] = f.name === 'version' ? neu : f.name === m.projektFeld ? (e.projekt as string) : f.art === 'verweis' && typeof w === 'string' ? (kopien.get(w) ?? w) : w;
      }
      const ziel = kopien.get(z.id as string)!;
      liste.push({ id: randomUUID(), objekt: m.name, art: 'anlegen', objektId: ziel, gesehen: 0, werte });
      // Die Herkunft der Werte wandert mit: was in der Vorlage geschätzt war, ist es auch in der Kopie.
      const gruppen = new Map<string, Werte>();
      for (const [k, st] of Object.entries(z._stand as Record<string, { herkunft?: string }>)) {
        if (st.herkunft && k in werte && k !== 'version' && k !== m.projektFeld) gruppen.set(st.herkunft, { ...(gruppen.get(st.herkunft) ?? {}), [k]: werte[k]! });
      }
      for (const [herkunft, felder] of gruppen) liste.push({ id: randomUUID(), objekt: m.name, art: 'aendern', objektId: ziel, gesehen: 0, werte: felder, herkunft });
    }
    return liste;
  });
  return vorgangAusfuehren(db, register, wer, befehle);
}
