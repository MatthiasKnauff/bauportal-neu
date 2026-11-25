// Kontaktkarte wie im bisherigen Bauportal: oben Anrufen, Mobil, E-Mail, Route, Ins Handy – und alle weiteren Nummern und
// E-Mails als Knöpfe. Nach den Kontaktangaben „＋ weitere Nummer / E-Mail / Anschrift / Ansprechpartner:in“: jeder Eintrag ein
// kleiner Block mit Kopfzeile (Art, Bezeichnung, ✕) und seinen Feldern aus dem Datenmodell (Baustein Feld).
import { zeigeMenue } from './baukasten/kontextmenue';
import { For, Show, createSignal } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { gilt, type Feld } from '../kern/modell';
import { ausfuehren, gemerkt, lebende } from './unterbau/abgleich';
import { darf, modell, neueKennung } from './unterbau/api';
import { FeldEingabe } from './baukasten/feld';
import { feldAendern, loesche } from './baukasten/detailkarte';

const ARTEN: Record<string, { zeichen: string; titel: string; knopf: string; bezeichnung: string; wert?: string }> = {
  telefon: { zeichen: '☎', titel: 'Telefon', knopf: 'weitere Nummer', bezeichnung: 'z. B. Zentrale, Büro, privat', wert: 'Nummer' },
  email: { zeichen: '✉', titel: 'E-Mail', knopf: 'weitere E-Mail', bezeichnung: 'z. B. Rechnungen, Buchhaltung', wert: 'E-Mail' },
  anschrift: { zeichen: '📍', titel: 'Anschrift', knopf: 'weitere Anschrift', bezeichnung: 'z. B. Rechnungsanschrift, Lager' },
  person: { zeichen: '👤', titel: 'Ansprechpartner:in', knopf: 'Ansprechpartner:in', bezeichnung: 'Funktion, z. B. Bauleiter:in', wert: 'Vorname Name' },
};
const nur = (n: string) => String(n ?? '').replace(/[^\d+]/g, '');
const wegeVon = (kontakt: string) => gemerkt('kontaktweg', `wege:${kontakt}`, () =>
  lebende('kontaktweg').filter((w) => w.werte.kontakt === kontakt).sort((a, b) => Number(a.werte.reihe ?? 0) - Number(b.werte.reihe ?? 0)));

/** Oben in der Karte: direkt anrufen, schreiben, hinfahren, ins Handy übernehmen. */
export function KontaktOben(p: { kontakt: Zeile }) {
  const w = () => p.kontakt.werte;
  const anschrift = () => [w().strasse, [w().plz, w().ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  // Mehrere Nummern bzw. Adressen: ein Knopf, der sie aufklappt (Name der Stelle bzw. der Person und die Nummer/Adresse)
  const wege = (art: 'telefon' | 'email') => [
    ...(w()[art] ? [{ text: art === 'telefon' ? 'Zentrale' : 'Firma', wert: String(w()[art]) }] : []),
    ...wegeVon(p.kontakt.id).flatMap((x) => {
      const v = x.werte;
      if (v.art === art && v.wert) return [{ text: String(v.bezeichnung || ''), wert: String(v.wert) }];
      if (v.art === 'person' && v[art]) return [{ text: String(v.wert || v.bezeichnung || ''), wert: String(v[art]) }];
      return [];
    }),
  ];
  const href = (art: 'telefon' | 'email', wert: string) => (art === 'telefon' ? `tel:${nur(wert)}` : `mailto:${wert}`);
  const knopf = (art: 'telefon' | 'email', titel: string) => {
    const l = wege(art);
    return (
      <Show when={l.length}>
        <Show when={l.length > 1} fallback={<a class="knopf klein" href={href(art, l[0]!.wert)} title={l[0]!.wert}>{titel}</a>}>
          <button type="button" class="knopf klein" aria-haspopup="menu" title={`${l.length} zur Wahl`}
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); zeigeMenue({ clientX: r.left, clientY: r.bottom + 4, preventDefault: () => undefined } as MouseEvent,
              l.map((x) => ({ titel: x.text ? `${x.text} – ${x.wert}` : x.wert, tun: () => { location.href = href(art, x.wert); } }))); }}>{titel} ▾</button>
        </Show>
      </Show>
    );
  };
  return (
    <div class="kontakt-oben">
      {knopf('telefon', '☎ Anrufen')}
      <Show when={w().mobil}><a class="knopf klein" href={`tel:${nur(String(w().mobil))}`}>📱 Mobil</a></Show>
      {knopf('email', '✉ E-Mail')}
      <Show when={anschrift()}><a class="knopf klein" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(anschrift())}&travelmode=driving`} target="_blank" rel="noopener noreferrer" title="Route in Google Maps planen">🧭 Route</a></Show>
      <a class="knopf klein" href={`/api/kontakt/${p.kontakt.id}.vcf`} title="Visitenkarte – auf dem Handy öffnet sie sich als neuer Kontakt zum Speichern">Ins Handy</a>
    </div>
  );
}

/** Nach den Kontaktangaben: weitere Nummern, E-Mails, Anschriften und Ansprechpartner:innen. */
export function Kontaktwege(p: { kontakt: Zeile }) {
  const m = () => modell('kontaktweg');
  const schreiben = () => darf('kontaktweg', 'schreiben');
  const [neu, setNeu] = createSignal<string | null>(null);   // eben angelegt: erstes Feld bekommt den Fokus
  const anlegen = (art: string) => {
    const id = neueKennung(), reihe = Math.max(0, ...wegeVon(p.kontakt.id).map((x) => Number(x.werte.reihe ?? 0))) + 1;
    ausfuehren({ objekt: 'kontaktweg', art: 'anlegen', objektId: id, werte: { kontakt: p.kontakt.id, art, reihe } }, `${ARTEN[art]!.titel} hinzufügen`);
    setNeu(id);
  };
  const felder = (z: Zeile): Feld[] => m().felder.filter((f) => !f.verborgen && !['kontakt', 'art', 'reihe'].includes(f.name) && (f.name !== 'bezeichnung' || z.werte.art === 'person') && gilt(f, z.werte, m()))
    .map((f) => (f.name === 'wert' && ARTEN[String(z.werte.art)]?.wert ? { ...f, titel: ARTEN[String(z.werte.art)]!.wert! } : f.name === 'bezeichnung' ? { ...f, titel: 'Funktion' } : f));
  return (
    <div class="kontaktwege">
      <For each={wegeVon(p.kontakt.id)}>{(z) => {
        const a = () => ARTEN[String(z.werte.art)] ?? ARTEN.telefon!;
        return (
          <div class="kw-block" ref={(el) => { if (neu() === z.id) queueMicrotask(() => { el.querySelector<HTMLElement>('input, button.auswahlliste-knopf')?.focus(); setNeu(null); }); }}>
            <div class="kw-kopf">
              <span>{a().zeichen} {a().titel}</span>
              <Show when={z.werte.art !== 'person'}>
                <input class="kw-bezeichnung" value={String(z.werte.bezeichnung ?? '')} placeholder={a().bezeichnung} aria-label={`Bezeichnung ${a().titel}`} readOnly={!schreiben()}
                  onChange={(e) => feldAendern(m(), z, m().felder.find((f) => f.name === 'bezeichnung')!, e.currentTarget.value)} />
              </Show>
              <Show when={darf('kontaktweg', 'loeschen')}><button type="button" class="knopf klein still" title="Entfernen" aria-label={`${a().titel} entfernen`} onClick={() => loesche(m(), z)}>✕</button></Show>
            </div>
            <div class="kw-felder">
              <For each={felder(z)}>{(f) => (
                <div style={{ 'grid-column': `span ${f.kartenBreite ?? 3}` }}>
                  <FeldEingabe feld={f} wert={z.werte[f.name] ?? null} gesperrt={!schreiben()} objekt="kontaktweg" zusammenhang={z.werte} onWert={(w) => feldAendern(m(), z, f, w)} />
                </div>
              )}</For>
            </div>
          </div>
        );
      }}</For>
      <Show when={schreiben()}>
        <div class="kw-neu">
          <For each={Object.entries(ARTEN)}>{([k, a]) => <button type="button" class="knopf klein" onClick={() => anlegen(k)}>＋ {a.zeichen} {a.knopf}</button>}</For>
        </div>
      </Show>
    </div>
  );
}
