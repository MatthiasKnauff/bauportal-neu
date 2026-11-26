// Ausschreibung: GAEB einlesen – über das gemeinsame Übernahme-Fenster (erst die Vorschau, dann alles oder nichts).
// X83/X86/X81: das Leistungsverzeichnis (neues LV oder Abgleich mit dem gewählten); X84: ein Angebot mit Preisen zum gewählten LV.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Modulregister } from '../kern/modul';
import { KENNUNG } from '../kern/modell';
import { gaebLesen } from '../module/ava/gaeb';
import { alsBenutzer, type Db } from './db';
import { Ablehnung } from './protokoll';
import { abgleicher, merken, type Vorschau } from './uebernahme';

/** Text einer Datei – in der Kodierung, die ihre XML-Kopfzeile nennt (ältere Programme schreiben oft ISO-8859-1). */
function dekodieren(b: Buffer): string {
  const kopf = b.subarray(0, 200).toString('latin1');
  const enc = /encoding=["']([^"']+)["']/i.exec(kopf)?.[1]?.toLowerCase() ?? 'utf-8';
  try { return new TextDecoder(/8859|latin|1252/.test(enc) ? 'windows-1252' : enc).decode(b); } catch { return b.toString('utf8'); }
}

export function avaRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> }): void {
  app.post('/api/ava/gaeb/vorschau', { preHandler: e.nurAngemeldet, bodyLimit: 50 * 1024 * 1024 }, async (req): Promise<Vorschau> => {
    const q = req.query as { projekt?: string; lv?: string };
    if (!KENNUNG.test(q.projekt ?? '')) throw new Ablehnung('Das Projekt fehlt');
    if (q.lv && !KENNUNG.test(q.lv)) throw new Ablehnung('Das LV ist unbekannt');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new Ablehnung('Die Datei fehlt');
    let d;
    try { d = gaebLesen(dekodieren(req.body)); } catch (err) { throw new Ablehnung((err as Error).message); }
    return merken(req.benutzer!.id, await alsBenutzer(e.db, req.benutzer!, async (c) => {
      const lvDa = q.lv ? (await c.query('select id, name from o_lv where id = $1 and projekt = $2 and not geloescht', [q.lv, q.projekt])).rows[0] : undefined;
      if (q.lv && !lvDa) throw new Ablehnung('Das gewählte LV gibt es in diesem Projekt nicht');
      const hinweise: string[] = [`GAEB DA XML, Datenart X${d.dp || '?'}: ${d.posten.filter((x) => x.art === 'titel').length} Titel, ${d.posten.filter((x) => x.art !== 'titel' && x.art !== 'hinweis').length} Positionen.`];
      if (d.dp === '84') {
        // Angebot: Preise der Bieter:in zu den Positionen des gewählten LV (nach OZ)
        if (!lvDa) throw new Ablehnung('Ein Angebot (X84) gehört zu einem LV – bitte zuerst links das LV wählen');
        const pos = new Map((await c.query('select id, oz from o_lv_position where lv = $1 and not geloescht', [q.lv])).rows.map((r) => [String(r.oz), String(r.id)]));
        const name = d.bieter || 'Bieter:in aus GAEB';
        const kontakt = (await c.query('select id from o_kontakt where lower(name) = lower($1) and not geloescht limit 1', [name])).rows[0]?.id as string | undefined;
        // Kontakte gehören zu keinem Projekt: eigener Abgleich ohne Zusammenhang
        const adressen = abgleicher(c, e.register, {}, 'gaeb', ['gaeb']);
        if (!kontakt) await adressen.abgleichen('kontakt', [{ kennung: `gaeb:${name}`, werte: { name, art: 'firma' } }], () => false);
        const bieter = kontakt ?? adressen.ort.kontakt!.get(`gaeb:${name}`)!;
        const { liste: angebotsliste, je, ort, abgleichen } = abgleicher(c, e.register, { projekt: q.projekt! }, 'gaeb', ['gaeb']);
        if (!kontakt) je.kontakt = adressen.je.kontakt!;
        await abgleichen('angebot', [{ kennung: `gaeb:${q.lv}:${bieter}`, werte: { lv: q.lv!, bieter } }], () => false);
        const angebot = ort.angebot!.get(`gaeb:${q.lv}:${bieter}`)!;
        const mitPreis = d.posten.filter((x) => x.ep != null && pos.has(x.oz));
        await abgleichen('angebot_preis', mitPreis.map((x) => ({ kennung: `gaeb:${angebot}:${x.oz}`, werte: { angebot, position: pos.get(x.oz)!, ep: x.ep } })), () => false);
        const ohne = d.posten.filter((x) => x.ep != null && !pos.has(x.oz)).length;
        hinweise.push(`Angebot von ${name}${kontakt ? '' : ' (neu in den Adressen)'}: ${mitPreis.length} Preise zum LV „${lvDa.name}“.`);
        if (ohne) hinweise.push(`${ohne} Preise passen zu keiner OZ des LV und bleiben weg.`);
        return { je, hinweise, liste: [...adressen.liste, ...angebotsliste] };   // der Kontakt zuerst – das Angebot verweist auf ihn
      }
      // Leistungsverzeichnis: neues LV oder Abgleich mit dem gewählten
      const lvId = lvDa ? String(lvDa.id) : randomUUID();
      const { liste, je, abgleichen } = abgleicher(c, e.register, { projekt: q.projekt!, lv: lvId }, 'gaeb', ['gaeb']);
      if (!lvDa) liste.push({ id: randomUUID(), gesehen: 0, herkunft: 'gaeb', objekt: 'lv', art: 'anlegen', objektId: lvId, werte: { projekt: q.projekt!, name: d.name || 'LV aus GAEB', nummer: '', status: 'bearbeitung' } });
      await abgleichen('lv_position', d.posten.map((x, i) => ({ kennung: x.kennung, werte: { oz: x.oz, art: x.art, kurztext: x.kurztext, langtext: x.langtext, menge: x.menge, einheit: x.einheit, ep: x.ep, reihe: i + 1 } })),
        (k) => k !== '');
      hinweise.push(lvDa ? `Abgleich mit dem LV „${lvDa.name}“: Positionen aus der Datei ersetzen die früher eingelesenen; von Hand Geändertes bleibt.` : `Neues LV „${d.name || 'LV aus GAEB'}“.`);
      if (d.posten.some((x) => x.ep != null)) hinweise.push('Die Einheitspreise der Datei stehen als geschätzte EP im LV.');
      return { je, hinweise, liste };
    }));
  });
}
