// Bieter:innen eines LV (wie im bisherigen Bauportal, ava-versand.js): je Firma eine kompakte Zeile – Klick auf ▸ klappt darunter
// die Einzelheiten auf: Ansprechperson und E-Mail-Adresse, Anrede, Stand mit „zugesagt bis“ bzw. Grund, Telefonnotizen (höchstens 10)
// mit „📞 angerufen“ und nächstem Anruf. Ein Baustein für „Versand & Rücklauf“ (ein LV) und „Nachverfolgen“ (alle LVs).
import { For, Show, createSignal, type JSX } from 'solid-js';
import type { Vorlage, Zeile } from '../kern/befehl';
import type { Werte } from '../kern/modell';
import { RUECKMELDUNGEN } from '../module/ava/beipackzettel';
import { anredeFuer, personenAus, type Person } from '../module/ava/bieterversand';
import { nachfassenFaellig, ruecklaufVon, type Ruecklauf } from '../module/ava/rechnung';
import { Auswahlliste } from './baukasten/auswahlliste';
import { FeldEingabe } from './baukasten/feld';
import { zeigeMenue } from './baukasten/kontextmenue';
import { spaltenwahl } from './baukasten/spalten';
import { Spaltenfeld } from './baukasten/spaltenfeld';
import { Zeichen } from './baukasten/zeichen';
import { name } from './avadaten';
import { ausfuehren, ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { darf, ich, neueKennung } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';

export const heute = () => new Date().toLocaleDateString('sv');
const jetzt = () => { const d = new Date(); return `${d.toLocaleDateString('sv')}T${d.toTimeString().slice(0, 5)}`; };
export const datum = (w: unknown) => (w ? new Date(String(w).slice(0, 10)).toLocaleDateString('de-DE') : '–');
const kurz = (w: unknown) => (w ? `${String(w).slice(8, 10)}.${String(w).slice(5, 7)}.` : '');
const zeitText = (w: unknown) => { const s = String(w ?? ''); return s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}${s.length > 10 ? ` ${s.slice(11, 16)}` : ''}` : ''; };
export const STAND_RUECKLAUF: Record<Ruecklauf, string> = { abgegeben: 'abgegeben', will_abgeben: 'will abgeben', gibt_nicht_ab: 'gibt nicht ab', offen: 'offen' };
export const HOECHSTENS_NOTIZEN = 10;

/** Telefonnotizen einer Bieter:in, älteste zuerst. */
export const notizenVon = (a: Zeile) => lebende('telefonnotiz').filter((n) => n.werte.angebot === a.id).sort((x, y) => String(x.werte.zeit ?? '').localeCompare(String(y.werte.zeit ?? '')));
/** Ansprechpersonen der Firma (Adressen, Kontaktwege „Ansprechpartner:in“). */
export const personenDer = (kontakt: string): Person[] => personenAus(lebende('kontaktweg').filter((w) => w.werte.kontakt === kontakt).map((w) => w.werte), String(sicht.kontakt?.[kontakt]?.werte.email ?? ''));
/** An wen die Mails an diese Bieter:in gehen: eigene Wahl, sonst die Adresse der Firma. */
export const adresseVon = (a: Zeile) => String(a.werte.an_email || sicht.kontakt?.[String(a.werte.bieter ?? '')]?.werte.email || '');
/** Anrede für die Mails an diese Bieter:in: eigene, sonst die der gewählten Ansprechperson, sonst „Damen und Herren“. */
export const anredeVonAngebot = (a: Zeile) => String(a.werte.anrede || '') || anredeFuer(personenDer(String(a.werte.bieter ?? '')).find((x) => x.name === a.werte.ansprechpartner));
/** Zuletzt: die jüngste Telefonnotiz (☎) oder Mail (✉) an diese Bieter:in. */
export function zuletztVon(a: Zeile): { weg: '☎' | '✉'; zeit: string } | null {
  const tel = notizenVon(a).at(-1)?.werte.zeit;
  const mails = lebende('nachricht').filter((n) => n.werte.quelle === `angebot|${a.id}`).map((n) => String(n.werte.verschickt_am || '')).filter(Boolean).sort();
  const mail = mails.at(-1) || (a.werte.angeschrieben ? String(a.werte.angeschrieben) : '');
  if (!tel && !mail) return null;
  return String(tel ?? '') > mail ? { weg: '☎', zeit: String(tel) } : { weg: '✉', zeit: mail };
}

const aendern = (a: Zeile, werte: Werte, titel: string) => ausfuehren({ objekt: 'angebot', art: 'aendern', objektId: a.id, werte }, `${name(a.werte.bieter)}: ${titel}`);
/** Telefonnotiz anlegen (höchstens 10 je Firma, wie bisher). */
export function notizAnlegen(a: Zeile, text: string): void {
  if (!text.trim()) return;
  if (notizenVon(a).length >= HOECHSTENS_NOTIZEN) { hinweis(`Höchstens ${HOECHSTENS_NOTIZEN} Telefonnotizen je Firma – eine ältere löschen.`, { art: 'fehler' }); return; }
  ausfuehren({ objekt: 'telefonnotiz', art: 'anlegen', objektId: neueKennung(), werte: { projekt: a.werte.projekt ?? null, angebot: a.id, zeit: jetzt(), wer: ich().name, text: text.trim() } }, `${name(a.werte.bieter)}: Telefonnotiz`);
}

/** Bieter:in aus dem LV nehmen: Angebot mit Preisen und Notizen in den Papierkorb – ein Rückgängig für alles. Schon angeschrieben:
 *  wie bisher auf Wunsch gleich eine Mail „Bitte nicht beachten“ (über den Mail-Dialog, gesendet wird erst dort). */
export function bieterEntfernen(e: MouseEvent, a: Zeile, bitteNichtBeachten: (a: Zeile) => void): void {
  if (a.werte.beauftragt === true) { hinweis('Die beauftragte Bieter:in lässt sich erst nach „Vergabe aufheben“ entfernen.', { art: 'fehler' }); return; }
  const weg = () => {
    ausfuehrenMehrere([...lebende('angebot_preis').filter((x) => x.werte.angebot === a.id).map((x) => ({ objekt: 'angebot_preis', art: 'loeschen' as const, objektId: x.id })),
      ...notizenVon(a).map((x) => ({ objekt: 'telefonnotiz', art: 'loeschen' as const, objektId: x.id })),
      { objekt: 'angebot', art: 'loeschen', objektId: a.id }] as Vorlage[], `${name(a.werte.bieter)} entfernt`);
    hinweis(`${name(a.werte.bieter)} entfernt – rückgängig mit Strg+Z. In den Adressen bleibt die Firma.`);
  };
  if (!a.werte.angeschrieben) { weg(); return; }
  zeigeMenue(e, [{ titel: `Entfernen (angeschrieben am ${datum(a.werte.angeschrieben)})`, gefahr: true, tun: weg },
    { titel: 'Entfernen und „Bitte nicht beachten“ senden …', gefahr: true, tun: () => { bitteNichtBeachten(a); weg(); } }]);
}

export function BieterTabelle(p: { bieter: Zeile[]; mitLv?: boolean; onLv?: (lv: string) => void; onEinzeln?: (a: Zeile) => void; onBitteNichtBeachten?: (a: Zeile) => void;
  onErinnern?: (a: Zeile) => void;   // Nachverfolgen: je Firma „📞 angerufen“ und „✉ erinnern“ (nur diese Firma)
  speicher?: string }): JSX.Element {
  const schreiben = () => darf('angebot', 'schreiben');
  const telefon = (a: Zeile) => { const k = sicht.kontakt?.[String(a.werte.bieter ?? '')]?.werte; return String(k?.telefon || k?.mobil || ''); };
  const lvName = (id: unknown) => { const l = sicht.lv?.[String(id ?? '')]?.werte; return l ? [l.nummer, l.name].filter(Boolean).join(' · ') : ''; };
  const [auf, setAuf] = createSignal<Set<string>>(new Set());
  const umschalten = (id: string) => setAuf((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // Spalten wählen und ordnen (Baustein Spaltenwahl, Rechtsklick auf den Kopf) – Bieter:in bleibt immer
  type Sp = { name: string; titel: string; fest?: boolean; zelle: (a: Zeile) => JSX.Element };
  const SPALTEN: Sp[] = [
    ...(p.mitLv ? [{ name: 'lv', titel: 'LV', zelle: (a: Zeile) => <button type="button" class="link-knopf" onClick={() => p.onLv?.(String(a.werte.lv))}>{lvName(a.werte.lv)}</button> },
      { name: 'abgabe', titel: 'Abgabe', zelle: (a: Zeile) => <>{datum(sicht.lv?.[String(a.werte.lv)]?.werte.abgabe)}</> }] : []),
    { name: 'bieter', titel: 'Bieter:in · Telefon', fest: true, zelle: (a) => <>
      <span class="vr-name"><button type="button" class="vr-auf" aria-expanded={auf().has(a.id)} title="Einzelheiten: Ansprechperson, Anrede, Telefonnotizen" onClick={() => umschalten(a.id)}>{auf().has(a.id) ? '▾' : '▸'}</button>{name(a.werte.bieter)}
        <Show when={!p.mitLv && !p.onErinnern && darf('angebot', 'loeschen')}><button type="button" class="knopf klein still vr-weg" title="Aus der Bieterliste nehmen – mit Angebot und Preisen in den Papierkorb (in den Adressen bleibt die Firma)" aria-label={`${name(a.werte.bieter)} entfernen`}
          onClick={(e) => bieterEntfernen(e, a, (x) => p.onBitteNichtBeachten?.(x))}><Zeichen name="loeschen" groesse={14} /></button></Show></span>
      <Show when={telefon(a)}><br /><a class="klein-text" href={`tel:${telefon(a).replace(/[^+\d]/g, '')}`}>{telefon(a)}</a></Show></> },
    { name: 'an', titel: 'An', zelle: (a) => <Show when={adresseVon(a)} fallback={<span class="gefahr-text klein-text">keine E-Mail</span>}><span class="klein-text">{adresseVon(a)}</span></Show> },
    { name: 'angeschrieben', titel: 'ange­schrieben', zelle: (a) => <>{datum(a.werte.angeschrieben)}</> },
    { name: 'stand', titel: 'Stand', zelle: (a) => { const st = ruecklaufVon(a); return <><Show when={schreiben() && st !== 'abgegeben'} fallback={<b class={`vr-${st}`}>{STAND_RUECKLAUF[st]}</b>}>
      <Auswahlliste titel={`Rückmeldung ${name(a.werte.bieter)}`} wert={String(a.werte.rueckmeldung || 'offen')} optionen={[...RUECKMELDUNGEN, { wert: 'abgegeben', titel: 'Angebot abgegeben' }]}
        onWert={(w) => (w === 'abgegeben' ? aendern(a, { eingang: heute() }, 'Angebot eingegangen') : aendern(a, { rueckmeldung: w }, 'Rückmeldung'))} /></Show>
      <Show when={st === 'will_abgeben' && a.werte.zusage_bis}><small> bis {kurz(a.werte.zusage_bis)}</small></Show></>; } },
    { name: 'zuletzt', titel: 'zuletzt', zelle: (a) => { const z = zuletztVon(a); return <>{z ? `${z.weg} ${kurz(z.zeit)}` : '–'}</>; } },
    { name: 'nachfassen', titel: 'nächster Anruf', zelle: (a) => { const st = ruecklaufVon(a); return <Show when={schreiben() && st !== 'abgegeben' && st !== 'gibt_nicht_ab'} fallback={<>{a.werte.nachfassen ? datum(a.werte.nachfassen) : ''}</>}>
      <FeldEingabe feld={{ name: 'nachfassen', titel: '', art: 'datum' }} wert={a.werte.nachfassen ?? null} onWert={(w) => aendern(a, { nachfassen: w || null }, 'Nächster Anruf')} />
      <Show when={nachfassenFaellig(a, heute())}><small class="gefahr-text"> fällig</small></Show></Show>; } },
    { name: 'eingang', titel: 'Angebot', zelle: (a) => <Show when={a.werte.eingang} fallback={<Show when={schreiben() && ruecklaufVon(a) !== 'gibt_nicht_ab'}><button type="button" class="knopf klein" onClick={() => aendern(a, { eingang: heute() }, 'Angebot eingegangen')}>eingegangen</button></Show>}>
      {datum(a.werte.eingang)}</Show> },
    ...(p.onErinnern ? [{ name: 'tun', titel: '', zelle: (a: Zeile) => <Show when={schreiben() && ruecklaufVon(a) !== 'abgegeben' && ruecklaufVon(a) !== 'gibt_nicht_ab'}><span class="vr-tun">
      <Show when={darf('telefonnotiz', 'schreiben')}><button type="button" class="knopf klein" title="Telefonnotiz „angerufen“ mit jetzt" onClick={() => notizAnlegen(a, 'angerufen')}>📞 angerufen</button></Show>
      <Show when={a.werte.angeschrieben && darf('nachricht', 'schreiben')}><button type="button" class="knopf klein" title="Erinnerung nur an diese Firma – im Mail-Dialog, gesendet wird erst dort" onClick={() => p.onErinnern!(a)}>✉ erinnern</button></Show></span></Show> }] : []),
  ];
  // ab Werk wie bisher: Versand – Firma, An, Stand, zuletzt; Nachverfolgen – Firma, Stand, zuletzt, nächster Anruf, angerufen/erinnern (der Rest in der Spaltenwahl)
  const abWerk = (n: string) => (p.mitLv ? n !== 'an' : p.onErinnern ? ['bieter', 'stand', 'zuletzt', 'nachfassen', 'tun'].includes(n) : ['bieter', 'an', 'stand', 'zuletzt'].includes(n));
  const spw = spaltenwahl(p.speicher ?? (p.mitLv ? 'bp_spalten_nachverfolgen2' : 'bp_spalten_versand2'), SPALTEN.map((x) => ({ name: x.name, titel: x.titel.replace('­', ''), inListe: abWerk(x.name), fest: x.fest })));
  const [feld, setFeld] = createSignal<{ x: number; y: number } | null>(null);
  const sichtbar = () => spw.sichtbare().map((x) => SPALTEN.find((y) => y.name === x.name)!);
  return (
    <div class="ps-rollen">
      <table class="preisspiegel versand">
        <thead><tr title="Rechtsklick: Spalten wählen und ordnen" onContextMenu={(e) => { e.preventDefault(); setFeld({ x: e.clientX, y: e.clientY }); }}>
          <For each={sichtbar()}>{(x) => <th {...spw.ziehbar(x.name)}>{x.titel}</th>}</For></tr></thead>
        <tbody>
          <For each={p.bieter}>{(a) => (<>
            <tr classList={{ 'vr-faellig': nachfassenFaellig(a, heute()), 'vr-ab': ruecklaufVon(a) === 'gibt_nicht_ab', 'vr-offen': auf().has(a.id) }}>
              <For each={sichtbar()}>{(x) => <td>{x.zelle(a)}</td>}</For>
            </tr>
            <Show when={auf().has(a.id)}><tr class="vr-det"><td colSpan={sichtbar().length}><BieterEinzelheiten a={a} onEinzeln={p.onEinzeln} /></td></tr></Show>
          </>)}</For>
        </tbody>
      </table>
      <Show when={feld()}>{(o) => <Spaltenfeld spalten={spw} ort={o()} onZu={() => setFeld(null)} />}</Show>
    </div>
  );
}

/** Aufgeklappt (wie bisher): An wen, Anrede, Stand mit „zugesagt bis“ / Grund, Telefonnotizen mit „angerufen“ und nächstem Anruf. */
function BieterEinzelheiten(p: { a: Zeile; onEinzeln?: (a: Zeile) => void }): JSX.Element {
  const a = () => p.a, kontakt = () => String(a().werte.bieter ?? '');
  const schreiben = () => darf('angebot', 'schreiben');
  const personen = () => personenDer(kontakt());
  const firmaMail = () => String(sicht.kontakt?.[kontakt()]?.werte.email ?? '');
  const mails = () => [...new Set([firmaMail(), ...lebende('kontaktweg').filter((w) => w.werte.kontakt === kontakt() && w.werte.art === 'email').map((w) => String(w.werte.wert ?? '')), ...personen().map((x) => x.email)].filter((m) => m.includes('@')))];
  const person = (n: string) => {
    const x = personen().find((y) => y.name === n);
    aendern(a(), { ansprechpartner: n, an_email: x && x.email !== firmaMail() ? x.email : '', anrede: '' }, 'Ansprechperson');
  };
  const st = () => ruecklaufVon(a()), fertig = () => st() === 'abgegeben' || st() === 'gibt_nicht_ab';
  // wie bisher: dieselbe Firma auch für ein anderes LV des Projekts anfragen (das noch nicht vergeben ist und sie noch nicht hat)
  const andereLvs = () => { const hat = new Set(lebende('angebot').filter((x) => x.werte.bieter === kontakt()).map((x) => String(x.werte.lv)));
    return lebende('lv').filter((l) => l.werte.projekt === a().werte.projekt && !hat.has(l.id) && !['vergeben', 'aufgehoben'].includes(String(l.werte.status ?? '')) && !l.werte.archiviert)
      .map((l) => ({ wert: l.id, titel: `LV ${[l.werte.nummer, l.werte.name].filter(Boolean).join(' ')}` })); };
  const notizen = () => notizenVon(a());
  let eingabe!: HTMLInputElement;
  return (
    <div class="vr-einzel">
      <div class="vr-einzel-an">
        <Show when={mails().length} fallback={<span class="gefahr-text">keine E-Mail-Adresse in den Adressen</span>}>
          <div class="feld"><label>Ansprechperson</label><Auswahlliste titel="Ansprechperson" gesperrt={!schreiben()} wert={String(a().werte.ansprechpartner ?? '')}
            optionen={[{ wert: '', titel: 'Firma allgemein' }, ...personen().map((x) => ({ wert: x.name, titel: [x.name, x.funktion].filter(Boolean).join(' · ') }))]} onWert={person} /></div>
          <div class="feld"><label>An</label><Auswahlliste titel="E-Mail an" gesperrt={!schreiben()} wert={adresseVon(a())} optionen={mails().map((m) => ({ wert: m, titel: m }))}
            onWert={(w) => aendern(a(), { an_email: w === firmaMail() ? '' : w }, 'E-Mail-Adresse')} /></div>
        </Show>
        <div class="feld"><label>Anrede</label><input value={String(a().werte.anrede ?? '')} placeholder={anredeVonAngebot({ ...a(), werte: { ...a().werte, anrede: '' } })} readOnly={!schreiben()} aria-label="Anrede"
          title="Anrede in den Mails – leer: aus der Ansprechperson in den Adressen" onChange={(e) => aendern(a(), { anrede: e.currentTarget.value.trim() }, 'Anrede')} /></div>
        <Show when={andereLvs().length && darf('angebot', 'schreiben')}>
          <div class="feld"><label>Auch anfragen für</label><Auswahlliste titel="Auch anfragen für" platzhalter="weiteres LV wählen …" wert={null} optionen={andereLvs()}
            onWert={(w) => { if (!w) return; ausfuehren({ objekt: 'angebot', art: 'anlegen', objektId: neueKennung(), werte: { projekt: a().werte.projekt ?? null, lv: w, bieter: kontakt() } }, `${name(kontakt())} auch für ein weiteres LV`);
              hinweis(`${name(kontakt())} steht jetzt auch bei ${andereLvs().find((x) => x.wert === w)?.titel ?? 'dem LV'} – angeschrieben wird dort.`); }} /></div>
        </Show>
        <p class="still-text klein-text">{a().werte.angeschrieben ? `angeschrieben am ${datum(a().werte.angeschrieben)}` : 'noch nicht angeschrieben'}
          <Show when={!a().werte.angeschrieben && p.onEinzeln && mails().length && st() !== 'gibt_nicht_ab'}> <button type="button" class="knopf klein haupt" title="Mail-Dialog nur für diese Firma – gesendet wird erst dort" onClick={() => p.onEinzeln!(a())}>✉ jetzt senden …</button></Show></p>
      </div>
      <div class="vr-einzel-stand">
        <Show when={st() === 'will_abgeben'}><FeldEingabe feld={{ name: 'zusage_bis', titel: 'Abgabe zugesagt bis', art: 'datum' }} gesperrt={!schreiben()} wert={a().werte.zusage_bis ?? null} onWert={(w) => aendern(a(), { zusage_bis: w || null }, 'zugesagt bis')} /></Show>
        <Show when={st() === 'gibt_nicht_ab'}><FeldEingabe feld={{ name: 'absage_grund', titel: 'Grund der Absage', art: 'text', vorschlagen: true }} objekt="angebot" gesperrt={!schreiben()} wert={a().werte.absage_grund ?? ''} onWert={(w) => aendern(a(), { absage_grund: w }, 'Grund der Absage')} /></Show>
        <Show when={st() === 'abgegeben'}><p class="still-text klein-text">Angebot eingegangen am {datum(a().werte.eingang)} – Preise unter „Angebote & Preisspiegel“.</p></Show>
      </div>
      <div class="vr-notizen" aria-label="Telefonnotizen">
        <For each={notizen()}>{(n, i) => <div class="vr-notiz"><i>{i() + 1}</i><span class="vr-zeit">{zeitText(n.werte.zeit)}</span><span>{String(n.werte.text ?? '')}<Show when={n.werte.wer}><small> · {String(n.werte.wer)}</small></Show></span>
          <Show when={darf('telefonnotiz', 'loeschen')}><button type="button" class="knopf klein still" aria-label="Notiz löschen" onClick={() => ausfuehren({ objekt: 'telefonnotiz', art: 'loeschen', objektId: n.id }, 'Telefonnotiz löschen')}>✕</button></Show></div>}</For>
        <Show when={a().werte.nachfassen && !fertig()}><div class="vr-notiz naechst"><i>↻</i><span class="vr-zeit">{datum(a().werte.nachfassen)}</span><span>wieder anrufen</span></div></Show>
        <Show when={!fertig() && darf('telefonnotiz', 'schreiben')}>
          <Show when={notizen().length < HOECHSTENS_NOTIZEN} fallback={<small class="still-text">{HOECHSTENS_NOTIZEN} von {HOECHSTENS_NOTIZEN} Notizen</small>}>
            <div class="reihe vr-notiz-neu">
              <div class="feld"><input ref={eingabe} placeholder="Telefonnotiz … (Enter)" aria-label="Telefonnotiz" onKeyDown={(e) => { if (e.key === 'Enter') { notizAnlegen(a(), e.currentTarget.value); e.currentTarget.value = ''; } }} /></div>
              <button type="button" class="knopf klein" title="Notiz „angerufen“ mit jetzt anlegen" onClick={() => { notizAnlegen(a(), eingabe.value.trim() || "angerufen"); eingabe.value = ""; }}>📞 angerufen</button>
              <FeldEingabe klein feld={{ name: 'nachfassen', titel: 'nächster Anruf', art: 'datum' }} wert={a().werte.nachfassen ?? null} onWert={(w) => aendern(a(), { nachfassen: w || null }, 'Nächster Anruf')} />
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}
