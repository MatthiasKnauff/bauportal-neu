// Zentrale Versandstelle in der Oberfläche: Verwaltung → Mail & Versand (Mailserver, Kennwort, Prüfen) und „Mail an alle“ –
// ein Dialog für jede Liste von Kontakten (Adressen, Gewerke & Firmen). Verschickt wird nie von hier, sondern über den
// Postausgang (server/versand.ts): Jede Mail ist eine Nachricht, die man dort sieht.
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { Vorlage, Zeile } from '../kern/befehl';
import { BUERO_ID, MAILSERVER_ID } from '../module/verwaltung/beipackzettel';
import { anhaengeVon, anhangText, anredeVon, type Anhang } from '../module/verwaltung/versand';
import { Detailkarte } from './baukasten/detailkarte';
import { FeldEingabe } from './baukasten/feld';
import { gilt, type Werte } from '../kern/modell';
import { Dialog } from './baukasten/dialog';
import { Formular } from './baukasten/formular';
import { Rahmen } from './baukasten/rahmen';
import { ausfuehrenMehrere, sicht } from './unterbau/abgleich';
import { darf, ich, modell, neueKennung, ruf, zustand } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';
import { springeZu } from './sprung';

// ---------- Postfach einrichten (Büro in der Verwaltung, eigenes unter Mein Konto) ----------
interface PostfachLage { buero: { kennwort: boolean; m365: boolean }; mein: { id: string; kennwort: boolean; m365: boolean } | null; appGeheimnis: boolean; nurTest: boolean }
const [postfachLage, setPostfachLage] = createSignal<PostfachLage | null>(null);
export const postfachLageHolen = () => ruf<PostfachLage>('/api/postfach/zustand').then(setPostfachLage, () => undefined);
export { postfachLage };

/** Kennwort bzw. Microsoft-Anmeldung und Prüfen – für jedes Postfach derselbe Baustein. postfach: „buero“ oder die Kennung. */
export function PostfachEinrichten(p: { postfach: string; werte: Record<string, unknown> | undefined }) {
  const [ergebnis, setErgebnis] = createSignal<{ gut: boolean; text: string } | null>(null);
  const [kennwort, setKennwort] = createSignal(false);
  if (!postfachLage()) void postfachLageHolen();
  const lage = () => (p.postfach === 'buero' ? postfachLage()?.buero : postfachLage()?.mein);
  const m365 = () => p.werte?.art === 'm365';
  const pruefen = async () => {
    setErgebnis({ gut: true, text: 'Anmeldung wird geprüft …' });
    try { await ruf('/api/postfach/pruefen', { postfach: p.postfach }); setErgebnis({ gut: true, text: 'Das Postfach nimmt die Anmeldung an. Verschickt wurde dabei nichts.' }); }
    catch (e) { setErgebnis({ gut: false, text: (e as Error).message }); }
  };
  const anmelden = async () => {
    try { const r = await ruf<{ adresse: string }>('/api/postfach/m365/start', { postfach: p.postfach }); window.open(r.adresse, '_blank', 'noopener,width=520,height=720'); setErgebnis({ gut: true, text: 'Im neuen Fenster bei Microsoft anmelden – danach hier „Anmeldung prüfen“.' }); }
    catch (e) { setErgebnis({ gut: false, text: (e as Error).message }); }
  };
  return (
    <fieldset>
      <legend>{m365() ? 'Anmeldung bei Microsoft 365' : 'Kennwort und Prüfung'}</legend>
      <p class="still-text klein-text">{m365()
        ? (lage()?.m365 ? `Angemeldet${p.werte?.m365_konto ? ` als ${String(p.werte.m365_konto)}` : ''} – kein Kennwort gespeichert.` : 'Noch nicht bei Microsoft angemeldet.')
        : (lage()?.kennwort ? 'Ein Kennwort ist gespeichert (verschlüsselt).' : 'Noch kein Kennwort gespeichert.')}</p>
      <Show when={postfachLage()?.nurTest}><p class="hinweis-kasten">Testserver: Hier wird nichts verschickt – Nachrichten bleiben im Postausgang „zurückgehalten“.</p></Show>
      <div class="reihe">
        <Show when={m365()} fallback={<button class="knopf" onClick={() => setKennwort(true)}>Kennwort eintragen …</button>}><button class="knopf" onClick={() => void anmelden()}>Mit Microsoft anmelden …</button></Show>
        <button class="knopf haupt" onClick={() => void pruefen()}>Anmeldung prüfen</button>
      </div>
      <Show when={ergebnis()}>{(e) => <p classList={{ 'feld-fehler': !e().gut, 'gut-text': e().gut }} role="status">{e().text}</p>}</Show>
      <Show when={kennwort()}>
        <Dialog titel="Kennwort des Postfachs" onAbbrechen={() => setKennwort(false)} knoepfe={<button class="knopf" onClick={() => setKennwort(false)}>Abbrechen</button>}>
          <Formular knopf="Speichern" pfad="/api/postfach/kennwort" fest={{ postfach: p.postfach }} felder={[{ name: 'kennwort', titel: 'Kennwort am Mailserver', typ: 'password', auto: 'new-password' }]}
            onFertig={() => { setKennwort(false); hinweis('Kennwort gespeichert.'); void postfachLageHolen(); }} />
        </Dialog>
      </Show>
    </fieldset>
  );
}

// ---------- Verwaltung → Mail & Versand ----------
export function MailVersand() {
  const m = () => modell('mailserver');
  const z = () => sicht.mailserver?.[MAILSERVER_ID];
  const [geheimnis, setGeheimnis] = createSignal(false);
  void postfachLageHolen();
  return (
    <Rahmen schluessel="verwaltung.mail" inhalt={<section class="blatt frei"><Show when={z()} fallback={<p class="still-text">Wird geladen …</p>}>{(zeile) => (
      <Detailkarte modell={m()} zeile={zeile()} zusatz={() => (<>
        <p class="still-text klein-text">Postfach des Büros – über das gehen alle Mails des Bauportals, wenn niemand „von mir“ wählt. Jede Mail steht erst im Postausgang, Erinnerungen werden gebündelt.
          Eigene Postfächer richten die Benutzer:innen unter „Mein Konto“ ein.</p>
        <PostfachEinrichten postfach="buero" werte={zeile().werte} />
        <fieldset>
          <legend>Microsoft 365 für das Büro</legend>
          <p class="still-text klein-text">Einmal die App des Büros in Entra ID eintragen (Mandant, Anwendungs-ID oben, Geheimnis hier) – Weiterleitungsadresse der App: {location.origin}/api/postfach/m365/zurueck,
            Berechtigungen Mail.Send, User.Read, offline_access. {postfachLage()?.appGeheimnis ? 'Ein Geheimnis ist gespeichert.' : 'Noch kein Geheimnis gespeichert.'}</p>
          <div class="reihe"><button class="knopf" onClick={() => setGeheimnis(true)}>Geheimnis der App eintragen …</button>
            <button class="knopf still" onClick={() => springeZu('nachricht', '', { modul: 'verwaltung', ansicht: 'postausgang' })}>Postausgang</button></div>
          <Show when={geheimnis()}>
            <Dialog titel="Geheimnis der App (Microsoft 365)" onAbbrechen={() => setGeheimnis(false)} knoepfe={<button class="knopf" onClick={() => setGeheimnis(false)}>Abbrechen</button>}>
              <Formular knopf="Speichern" pfad="/api/postfach/app-geheimnis" felder={[{ name: 'geheimnis', titel: 'Geheimer Clientschlüssel (Wert)', typ: 'password', auto: 'off' }]}
                onFertig={() => { setGeheimnis(false); hinweis('Geheimnis gespeichert.'); void postfachLageHolen(); }} />
            </Dialog>
          </Show>
        </fieldset>
      </>)} />
    )}</Show></section>} />
  );
}

/** Mein Konto: das eigene Postfach (wie beim Büro: Mailserver oder Microsoft 365) – Felder wie im Modell, gespeichert über /api/postfach/mein. */
export function MeinPostfach() {
  void postfachLageHolen();
  const m = () => modell('postfach');
  const z = () => Object.values(sicht.postfach ?? {}).find((x) => !x.geloescht && x.werte.inhaber === ich().id);
  const setzen = (name: string, w: unknown) => void ruf('/api/postfach/mein', { [name]: w }).then(() => postfachLageHolen(), (e: Error) => hinweis(e.message, { art: 'fehler' }));
  const felder = () => m().felder.filter((f) => f.name !== 'inhaber' && f.name !== 'm365_konto' && gilt(f, (z()?.werte ?? { art: '' }) as Werte, m()));
  return (
    <section class="mein-postfach">
      <h3>Mein Postfach</h3>
      <p class="still-text klein-text">Projektmails gehen ab Werk über das Büro. Mit einem eigenen Postfach kannst du beim Schreiben „von mir“ wählen.</p>
      <Show when={z()} fallback={<button class="knopf" onClick={() => setzen('absender', String(sicht.benutzer?.[ich().id]?.werte.email ?? ''))}>Eigenes Postfach einrichten</button>}>{(pf) => <>
        <div class="formular"><For each={felder()}>{(f) => <FeldEingabe feld={f} wert={(pf().werte[f.name] as never) ?? null} onWert={(w) => setzen(f.name, w)} />}</For></div>
        <PostfachEinrichten postfach={pf().id} werte={pf().werte} />
      </>}</Show>
    </section>
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
  /** je Kontakt eigene Anhänge und Platzhalter (z. B. mehrere LVs auf einmal: jede Firma ihre LVs, {lvs} als Liste) */
  anhaengeJe?: (kontaktId: string) => { titel: string; anhang: Anhang }[];
  platzhalter?: (kontaktId: string) => Record<string, string>;
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
  const [merk, setMerk] = createSignal(true), [kopie, setKopie] = createSignal(false), [vonMir, setVonMir] = createSignal(false);
  const meinPostfach = () => Object.values(sicht.postfach ?? {}).find((x) => !x.geloescht && x.werte.inhaber === ich().id && String(x.werte.absender ?? '').includes('@'));
  const bueroAdresse = () => String(sicht.mailserver?.[MAILSERVER_ID]?.werte.absender ?? '');
  // „Kopie an mich“ (28.11.2026): an die eigene Adresse (Verwaltung → Benutzer), sonst an die Adresse des Büros
  const meineMail = () => [sicht.benutzer?.[ich().id]?.werte.email, sicht.buero?.[BUERO_ID]?.werte.email].map((x) => String(x ?? '')).find((x) => x.includes('@')) ?? '';
  const anBuero = () => !String(sicht.benutzer?.[ich().id]?.werte.email ?? '').includes('@');
  const [gewaehlt, setGewaehlt] = createSignal(new Set(a.vorab ?? a.ids));
  const mit = () => mitAdresse().filter((k) => gewaehlt().has(k.id));
  const umschalten = (id: string) => setGewaehlt((g) => { const n = new Set(g); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ok = () => {
    if (!betreff().trim()) { hinweis('Bitte einen Betreff eintragen.', { art: 'fehler' }); return; }
    const anhaengeFuer = (k: Zeile) => (a.anhaengeJe?.(k.id) ?? a.anhaenge ?? []).map((x) => anhangText(x.anhang)).join('\n') || null;
    const fuellen = (t: string, k: Zeile) => Object.entries(a.platzhalter?.(k.id) ?? {}).reduce((x, [n, w]) => x.replaceAll(`{${n}}`, w), t.replaceAll('{anrede}', anrede(k)));
    const erste = mit()[0], pf = vonMir() ? meinPostfach()!.id : null;
    ausfuehrenMehrere([...mit().map((k) => ({ objekt: 'nachricht', art: 'anlegen' as const, objektId: neueKennung(), werte: { an: adresse(k), kontakt: k.id, betreff: betreff().trim(), postfach: pf,
      text: fuellen(text(), k), art: 'mitteilung', stand: 'wartet', projekt: a.projekt ?? null, quelle: a.quelle?.(k.id) ?? `kontakt|${k.id}`, anhaenge: anhaengeFuer(k) } })),
    // Kopie an mich (wie bisher): eine Mail wie die erste, ohne Anhänge
    ...(kopie() && erste && meineMail().includes('@') ? [{ objekt: 'nachricht', art: 'anlegen' as const, objektId: neueKennung(), werte: { an: meineMail(), betreff: `Kopie: ${betreff().trim()}`, postfach: pf,
      text: `Kopie der Mail an ${mit().length} ${mit().length === 1 ? 'Empfänger:in' : 'Empfänger:innen'} (${mit().map((k) => String(k.werte.name ?? '')).join(', ')}):\n\n${fuellen(text(), erste)}`, art: 'mitteilung', stand: 'wartet', projekt: a.projekt ?? null, quelle: 'kopie' } }] : []),
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
        {/* Absender (28.11.2026): Projektmails ab Werk über das Büro; mit eigenem Postfach wählbar „von mir“ */}
        <Show when={meinPostfach()}>
          <div class="auswahl segment" role="radiogroup" aria-label="Absender">
            <button type="button" role="radio" aria-checked={!vonMir()} classList={{ aktiv: !vonMir() }} onClick={() => setVonMir(false)}>über das Büro{bueroAdresse() ? ` (${bueroAdresse()})` : ''}</button>
            <button type="button" role="radio" aria-checked={vonMir()} classList={{ aktiv: vonMir() }} onClick={() => setVonMir(true)}>von mir ({String(meinPostfach()!.werte.absender ?? '')})</button>
          </div>
        </Show>
        <div class="reihe mail-optionen">
          <Show when={a.merken}><label><input type="checkbox" checked={merk()} onChange={(e) => setMerk(e.currentTarget.checked)} /> {a.merken!.titel}</label></Show>
          <label title={meineMail() ? `Eine Kopie geht an ${meineMail()}${anBuero() ? ' (Büro – eigene Adresse unter Verwaltung → Benutzer)' : ''}` : 'Dafür fehlt eine E-Mail-Adresse (Verwaltung → Benutzer oder Büro)'}><input type="checkbox" disabled={!meineMail().includes('@')} checked={kopie()} onChange={(e) => setKopie(e.currentTarget.checked)} /> Kopie an mich</label>
          <Show when={a.vorlage}><button type="button" class="knopf klein still" onClick={() => { setBetreff(a.vorlage!.betreff); setText(a.vorlage!.text); }}>↺ Text der Vorlage</button></Show>
        </div>
        <Show when={a.anhaenge?.length}><p class="still-text klein-text">Anhänge (entstehen beim Versand aus dem dann aktuellen Stand): <b>{a.anhaenge!.map((x) => x.titel).join(' · ')}</b></p></Show>
        <Show when={a.anhaengeJe && mit().length}><p class="still-text klein-text">Anhänge je Firma (entstehen beim Versand): <For each={mit().slice(0, 6)}>{(k, i) => <>{i() ? ' · ' : ''}<b>{String(k.werte.name ?? '')}</b>: {a.anhaengeJe!(k.id).length} Dateien</>}</For>{mit().length > 6 ? ' …' : ''}</p></Show>
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
