// Zentrale Versandstelle in der Oberfläche: Verwaltung → Mail & Versand (Mailserver, Kennwort, Prüfen) und „Mail an alle“ –
// ein Dialog für jede Liste von Kontakten (Adressen, Gewerke & Firmen). Verschickt wird nie von hier, sondern über den
// Postausgang (server/versand.ts): Jede Mail ist eine Nachricht, die man dort sieht.
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { Vorlage, Zeile } from '../kern/befehl';
import { BUERO_ID, MAILSERVER_ID } from '../module/verwaltung/beipackzettel';
import { anhaengeVon, anhangText, anredeVon, type Anhang } from '../module/verwaltung/versand';
import { Detailkarte } from './baukasten/detailkarte';
import { Dialog } from './baukasten/dialog';
import { Formular } from './baukasten/formular';
import { Rahmen } from './baukasten/rahmen';
import { ausfuehrenMehrere, sicht } from './unterbau/abgleich';
import { darf, modell, neueKennung, ruf, zustand } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';
import { springeZu } from './sprung';

// ---------- Verwaltung → Mail & Versand ----------
export function MailVersand() {
  const m = () => modell('mailserver');
  const z = () => sicht.mailserver?.[MAILSERVER_ID];
  const [lage, setLage] = createSignal<{ eingerichtet: boolean; kennwortGesetzt: boolean; nurTest: boolean } | null>(null);
  const [ergebnis, setErgebnis] = createSignal<{ gut: boolean; text: string } | null>(null);
  const [kennwort, setKennwort] = createSignal(false);
  const holeLage = () => ruf<{ eingerichtet: boolean; kennwortGesetzt: boolean; nurTest: boolean }>('/api/mail/zustand').then(setLage, () => undefined);
  void holeLage();
  const pruefen = async () => {
    setErgebnis({ gut: true, text: 'Anmeldung am Mailserver wird geprüft …' });
    try { await ruf('/api/mail/pruefen', {}); setErgebnis({ gut: true, text: 'Der Mailserver nimmt die Anmeldung an. Verschickt wurde dabei nichts.' }); }
    catch (e) { setErgebnis({ gut: false, text: (e as Error).message }); }
  };
  return (
    <Rahmen schluessel="verwaltung.mail" inhalt={<section class="blatt schmal"><Show when={z()} fallback={<p class="still-text">Wird geladen …</p>}>{(zeile) => (
      <Detailkarte modell={m()} zeile={zeile()} zusatz={() => (
        <fieldset>
          <legend>Kennwort und Prüfung</legend>
          <p class="still-text klein-text">Jede Mail des Bauportals geht über diese eine Stelle: sie steht erst im Postausgang, Erinnerungen werden gebündelt.
            {lage()?.kennwortGesetzt ? ' Ein Kennwort ist gespeichert.' : ' Noch kein Kennwort gespeichert.'}</p>
          <Show when={lage()?.nurTest}><p class="hinweis-kasten">Testserver: Hier wird nichts verschickt – Nachrichten bleiben im Postausgang „zurückgehalten“.</p></Show>
          <div class="reihe"><button class="knopf" onClick={() => setKennwort(true)}>Kennwort eintragen …</button><button class="knopf haupt" onClick={pruefen}>Anmeldung prüfen</button>
            <button class="knopf still" onClick={() => springeZu('nachricht', '', { modul: 'verwaltung', ansicht: 'postausgang' })}>Postausgang</button></div>
          <Show when={ergebnis()}>{(e) => <p classList={{ 'feld-fehler': !e().gut, 'gut-text': e().gut }} role="status">{e().text}</p>}</Show>
          <Show when={kennwort()}>
            <Dialog titel="Kennwort für den Mailserver" onAbbrechen={() => setKennwort(false)} knoepfe={<button class="knopf" onClick={() => setKennwort(false)}>Abbrechen</button>}>
              <Formular knopf="Speichern" pfad="/api/mail/kennwort" felder={[{ name: 'kennwort', titel: 'Kennwort des Benutzers am Mailserver', typ: 'password', auto: 'new-password' }]}
                onFertig={() => { setKennwort(false); hinweis('Kennwort gespeichert.'); void holeLage(); }} />
            </Dialog>
          </Show>
        </fieldset>
      )} />
    )}</Show></section>} />
  );
}

// ---------- Mail an alle ----------
/** Stellschrauben des einen Mail-Dialogs (Adressen, Gewerke & Firmen, Versand an Bieter:innen). */
export interface MailAuftrag {
  ids: string[]; titel: string; projekt?: string;
  betreff?: string; text?: string;
  /** vorab angehakt (leer: alle mit E-Mail-Adresse) */
  vorab?: string[];
  /** Anhänge – entstehen erst beim Versand aus dem dann aktuellen Stand (titel nur zur Anzeige) */
  anhaenge?: { titel: string; anhang: Anhang }[];
  /** derselbe Schritt hält zusätzlich etwas fest, z. B. „angeschrieben am“ – Rückgängig nimmt beides zurück */
  dazu?: (kontaktIds: string[]) => Vorlage[];
  /** Quelle je Kontakt (Herkunft der Nachricht); ab Werk der Kontakt selbst */
  quelle?: (kontaktId: string) => string;
  /** E-Mail-Adresse und Anrede je Kontakt, wenn sie hier anders gelten (z. B. Ansprechperson der Bieter:in); ab Werk aus den Adressen */
  an?: (kontaktId: string) => string | undefined;
  anrede?: (kontaktId: string) => string | undefined;
  /** „↺ Text der Vorlage“: Betreff und Text wieder wie ab Werk bzw. in der Vorlage */
  vorlage?: { betreff: string; text: string };
  /** „Text merken“ (z. B. für dieses LV) – wird beim Senden gerufen, wenn der Haken sitzt und sich etwas geändert hat */
  merken?: { titel: string; tun: (betreff: string, text: string) => Vorlage[] };
}
const [mailAn, setMailAn] = createSignal<MailAuftrag | null>(null);
/** „Mail an alle“ für gewählte Kontakte öffnen (je Kontakt eine eigene Mail, {anrede} wird ersetzt). */
export const mailAnAlle = (ids: string[], titel = 'Mail an alle', projekt?: string) => setMailAn({ ids, projekt, titel });
/** Derselbe Dialog mit allen Stellschrauben (z. B. Unterlagen an Bieter:innen). */
export const mailSchreiben = (a: MailAuftrag) => setMailAn(a);

export function MailAnAlleFenster() {
  return <Show when={mailAn()} keyed>{(x) => <MailDialog a={x} onZu={() => setMailAn(null)} />}</Show>;
}
function MailDialog(p: { a: MailAuftrag; onZu: () => void }) {
  const a = p.a;
  const [betreff, setBetreff] = createSignal(a.betreff ?? '');
  const [text, setText] = createSignal(a.text ?? '{anrede}\n\n\n\nMit freundlichen Grüßen\n' + String(sicht.buero?.[BUERO_ID]?.werte.name ?? ''));
  const kontakte = createMemo(() => a.ids.map((id) => sicht.kontakt?.[id]).filter((k): k is Zeile => !!k && !k.geloescht));
  const adresse = (k: Zeile) => String(a.an?.(k.id) || k.werte.email || ''), anrede = (k: Zeile) => a.anrede?.(k.id) || anredeVon(k.werte);
  const mitAdresse = () => kontakte().filter((k) => adresse(k).includes('@')), ohne = () => kontakte().filter((k) => !adresse(k).includes('@'));
  const [merk, setMerk] = createSignal(true), [kopie, setKopie] = createSignal(false);
  const bueroMail = () => String(sicht.buero?.[BUERO_ID]?.werte.email ?? '');
  const [gewaehlt, setGewaehlt] = createSignal(new Set(a.vorab ?? a.ids));
  const mit = () => mitAdresse().filter((k) => gewaehlt().has(k.id));
  const umschalten = (id: string) => setGewaehlt((g) => { const n = new Set(g); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ok = () => {
    if (!betreff().trim()) { hinweis('Bitte einen Betreff eintragen.', { art: 'fehler' }); return; }
    const anhaenge = (a.anhaenge ?? []).map((x) => anhangText(x.anhang)).join('\n') || null;
    const erste = mit()[0];
    ausfuehrenMehrere([...mit().map((k) => ({ objekt: 'nachricht', art: 'anlegen' as const, objektId: neueKennung(), werte: { an: adresse(k), kontakt: k.id, betreff: betreff().trim(),
      text: text().replaceAll('{anrede}', anrede(k)), art: 'mitteilung', stand: 'wartet', projekt: a.projekt ?? null, quelle: a.quelle?.(k.id) ?? `kontakt|${k.id}`, anhaenge } })),
    // Kopie ans Büro (wie bisher „Kopie an mich“): eine Mail wie die erste, ohne Anhänge
    ...(kopie() && erste && bueroMail().includes('@') ? [{ objekt: 'nachricht', art: 'anlegen' as const, objektId: neueKennung(), werte: { an: bueroMail(), betreff: `Kopie: ${betreff().trim()}`,
      text: `Kopie der Mail an ${mit().length} ${mit().length === 1 ? 'Empfänger:in' : 'Empfänger:innen'} (${mit().map((k) => String(k.werte.name ?? '')).join(', ')}):\n\n${text().replaceAll('{anrede}', anrede(erste))}`, art: 'mitteilung', stand: 'wartet', projekt: a.projekt ?? null, quelle: 'kopie' } }] : []),
    ...(a.merken && merk() && (betreff() !== (a.betreff ?? '') || text() !== (a.text ?? '')) ? a.merken.tun(betreff(), text()) : []),
    ...(a.dazu?.(mit().map((k) => k.id)) ?? [])], `${a.titel}: ${mit().length} Mails`);
    hinweis(`${mit().length} ${mit().length === 1 ? 'Mail steht' : 'Mails stehen'} im Postausgang – rückgängig mit Strg+Z, solange sie noch nicht verschickt sind.`);
    p.onZu();
  };
  return (
    <Dialog titel={a.titel} breit onAbbrechen={p.onZu}
      knoepfe={<><button type="button" class="knopf" onClick={p.onZu}>Abbrechen</button><button type="button" class="knopf haupt" disabled={!mit().length || !darf('nachricht', 'schreiben')} onClick={ok}>In den Postausgang ({mit().length})</button></>}>
      <div class="formular">
        <p class="still-text">Je Kontakt eine eigene Mail – niemand sieht die anderen. <b>{'{anrede}'}</b> wird ersetzt, z. B. „{mit()[0] ? anrede(mit()[0]!) : 'Sehr geehrte Damen und Herren,'}“.</p>
        <Show when={mitAdresse().length > 1 || a.vorab}>
          <fieldset class="mail-an"><legend>An ({mit().length} von {mitAdresse().length})</legend>
            <For each={mitAdresse()}>{(k) => <label><input type="checkbox" checked={gewaehlt().has(k.id)} onChange={() => umschalten(k.id)} /> {String(k.werte.name ?? '')} <small class="still-text">{adresse(k)}</small></label>}</For>
          </fieldset>
        </Show>
        <div class="feld"><label for="mail-betreff">Betreff</label><input id="mail-betreff" value={betreff()} onInput={(e) => setBetreff(e.currentTarget.value)} /></div>
        <div class="feld"><label for="mail-text">Text</label><textarea id="mail-text" rows={10} value={text()} onInput={(e) => setText(e.currentTarget.value)} /></div>
        <div class="reihe mail-optionen">
          <Show when={a.merken}><label><input type="checkbox" checked={merk()} onChange={(e) => setMerk(e.currentTarget.checked)} /> {a.merken!.titel}</label></Show>
          <label title={bueroMail() ? `Eine Kopie geht an ${bueroMail()}` : 'Dafür fehlt die E-Mail-Adresse des Büros (Verwaltung → Büro)'}><input type="checkbox" disabled={!bueroMail().includes('@')} checked={kopie()} onChange={(e) => setKopie(e.currentTarget.checked)} /> Kopie ans Büro</label>
          <Show when={a.vorlage}><button type="button" class="knopf klein still" onClick={() => { setBetreff(a.vorlage!.betreff); setText(a.vorlage!.text); }}>↺ Text der Vorlage</button></Show>
        </div>
        <Show when={a.anhaenge?.length}><p class="still-text klein-text">Anhänge (entstehen beim Versand aus dem dann aktuellen Stand): <b>{a.anhaenge!.map((x) => x.titel).join(' · ')}</b></p></Show>
        <Show when={ohne().length}><p class="still-text klein-text">Ohne E-Mail-Adresse, bekommen nichts ({ohne().length}): <For each={ohne().slice(0, 10)}>{(k, i) => <>{i() ? ', ' : ''}{String(k.werte.name ?? '')}</>}</For>{ohne().length > 10 ? ' …' : ''}</p></Show>
      </div>
    </Dialog>
  );
}

/** Postausgang: welche Anhänge eine Nachricht bekommt – lesbar statt „druck|ava.lv|…“; sie entstehen erst beim Versand. */
export function NachrichtAnhaenge(p: { nachricht: Zeile }) {
  const liste = () => anhaengeVon(p.nachricht.werte).map((a) => {
    if (a.art === 'dokument') { const d = sicht.dokument?.[a.id]; return d && !d.geloescht ? String(d.werte.name ?? 'Dokument') : 'Dokument – gibt es nicht mehr'; }
    if (a.art === 'x83') { const lv = sicht.lv?.[a.id]; return lv && !lv.geloescht ? `LV ${[lv.werte.nummer, lv.werte.name].filter(Boolean).join(' ')}.X83` : 'X83 – das LV gibt es nicht mehr'; }
    const d = zustand()!.module.flatMap((m) => m.ausdrucke ?? []).find((x) => x.id === a.ausdruck), z = d && sicht[d.objekt]?.[a.id];
    return d && z && !z.geloescht ? `${d.titel}: ${String(z.werte[modell(d.objekt).anzeigeFeld] ?? '')}.pdf` : 'PDF – der Eintrag ist nicht mehr da';
  });
  return <Show when={liste().length}><fieldset><legend>Anhänge</legend><p class="klein-text">{liste().join(' · ')}</p>
    <p class="still-text klein-text">Entstehen beim Verschicken aus dem dann aktuellen Stand – mit den Rechten der Person, die die Nachricht angelegt hat.</p></fieldset></Show>;
}
