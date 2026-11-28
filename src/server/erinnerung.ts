// Erinnerung zur Frist der Bautagebuch-Einträge (module/bautagebuch/erinnerung.ts): Wer eine Frist setzt, wird daran erinnert.
// Die Erinnerung ist eine Nachricht im Postausgang (Art „Erinnerung“, fällig am Tag der Frist) – die zentrale Versandstelle bündelt
// und verschickt sie. Ändert sich die Frist oder wird der Eintrag erledigt bzw. gelöscht, ändert sich die wartende Erinnerung mit.
import { randomUUID } from 'node:crypto';
import type { Befehl } from '../kern/befehl';
import type { Werte } from '../kern/modell';
import { erinnerungFuer } from '../module/bautagebuch/erinnerung';
import { regelAnmelden } from './protokoll';

export function erinnerungsregelnAnmelden(): void {
  regelAnmelden('bericht_eintrag', 'erinnerung', {
    async vor(c, b, vorher, werte) {
      // die Frist setzt jemand: diese Person wird erinnert (ohne Frist niemand)
      if (werte && 'frist' in werte && (b.art === 'anlegen' || werte.frist !== vorher?.frist))
        werte.erinnern = werte.frist ? String((await c.query('select bp_ich() as ich')).rows[0].ich ?? '') || null : null;
    },
    async nach(c, b, vorher, werte) {
      if (b.art === 'aendern' && !werte) return [];
      const quelle = `bericht_eintrag|${b.objektId}`;
      const warten = (await c.query("select id, an from o_nachricht where quelle = $1 and stand = 'wartet' and not geloescht", [quelle])).rows.map((z) => ({ id: String(z.id), an: String(z.an).trim().toLowerCase() }));
      const folge = (objektId: string, art: Befehl['art'], w: Werte): Befehl => ({ id: randomUUID(), objekt: 'nachricht', art, objektId, werte: w, gesehen: b.gesehen });
      if (b.art === 'loeschen') return warten.map((x) => folge(x.id, 'aendern', { stand: 'verworfen' }));
      const e = { ...(vorher as Werte | undefined), ...werte } as Werte;
      const pr = e.projekt ? (await c.query('select nummer, name from o_projekt where id = $1', [e.projekt])).rows[0] : undefined;
      const be = e.bericht ? (await c.query('select nummer, datum from o_tagesbericht where id = $1', [e.bericht])).rows[0] : undefined;
      // an wen: wer die Frist gesetzt hat – mit der Einstellung „an mich und die Bauleitung des Projekts“ auch die Mitglieder des Projekts
      const setzer = e.erinnern ? (await c.query('select email, erinnerung from o_benutzer where id = $1 and not geloescht and not gesperrt', [e.erinnern])).rows[0] : undefined;
      const weitere = setzer?.erinnerung === 'bauleitung' && e.projekt ? (await c.query(`select b.email from o_projekt_mitglied m join o_benutzer b on b.id = m.benutzer
        where m.projekt = $1 and not m.geloescht and not b.geloescht and not b.gesperrt and b.id <> $2`, [e.projekt, e.erinnern])).rows.map((z) => String(z.email ?? '')) : [];
      const an = [...new Set([String(setzer?.email ?? ''), ...weitere].map((x) => x.trim().toLowerCase()).filter((x) => x.includes('@')))];
      const soll = an.length ? erinnerungFuer(e, [pr?.nummer, pr?.name].filter(Boolean).join(' '), { nummer: be?.nummer, datum: be?.datum }) : null;
      if (!soll) return warten.map((x) => folge(x.id, 'aendern', { stand: 'verworfen' }));
      const w: Werte = { betreff: soll.betreff, text: soll.text, faellig: soll.faellig };
      // neu nur, wenn die Frist (oder wer erinnert wird) gerade gesetzt wurde oder der Eintrag wieder offen ist – nicht nach jeder Textänderung
      const neu = b.art === 'anlegen' || 'frist' in (werte ?? {}) || 'erinnern' in (werte ?? {}) || (werte?.erledigt === false && vorher?.erledigt === true);
      return [
        ...warten.map((x) => (an.includes(x.an) ? folge(x.id, 'aendern', w) : folge(x.id, 'aendern', { stand: 'verworfen' }))),
        ...(neu || warten.length ? an.filter((a) => !warten.some((x) => x.an === a)).map((a) => folge(randomUUID(), 'anlegen', { ...w, an: a, art: 'erinnerung', stand: 'wartet', projekt: e.projekt ?? null, quelle })) : []),
      ];
    },
  });
}
