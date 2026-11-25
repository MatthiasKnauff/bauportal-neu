// Startseite: unter den Apps der Stand des oben gewählten Projekts – was im Bauzeitenplan gerade läuft und als Nächstes
// kommt, der letzte Tagesbericht, offene Mängel und Aufgaben mit Frist. Ein Klick öffnet die App. Gelesen wird im Gerät.
import { For, Show, createMemo, type JSX } from 'solid-js';
import { unwrap } from 'solid-js/store';
import type { Zeile } from '../kern/befehl';
import { planAus } from '../module/bauzeitenplan/plan';
import { isoAus, tagAus } from '../module/bauzeitenplan/kalender';
import { geaendert, sicht } from './unterbau/abgleich';
import { darf } from './unterbau/api';
import { gewaehlteVersion } from './projekt';

const lebende = (o: string): Zeile[] => { geaendert(o); return Object.values(sicht[o] ?? {}).map((z) => unwrap(z)).filter((z) => !z.geloescht); };
const kurz = (iso: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.` : '');

export function Projektkacheln(p: { projekt: string; onApp: (modul: string, ansicht?: string) => void }) {
  const heute = new Date().toLocaleDateString('sv');
  const name = () => { const w = sicht.projekt?.[p.projekt]?.werte; return [w?.nummer, w?.name].filter(Boolean).join(' · '); };
  const plan = createMemo(() => {
    if (!darf('vorgang', 'lesen')) return null;
    const versionen = lebende('version').filter((v) => v.werte.projekt === p.projekt && v.werte.bereich === 'bauzeitenplan');
    const v = versionen.find((x) => x.id === gewaehlteVersion(p.projekt, 'bauzeitenplan')) ?? versionen.find((x) => x.werte.gueltig) ?? versionen[0];
    if (!v) return null;
    const in_ = (o: string) => lebende(o).filter((x) => x.werte.version === v.id);
    const pl = planAus({ vorgaenge: in_('vorgang'), links: in_('verknuepfung'), zeitplan: in_('zeitplan')[0]?.werte, frei: in_('freier_tag'), land: '', heute });
    const blatt = pl.zeilen.filter((z) => !z.termin.gruppe && z.termin.f > z.termin.s);
    const bis = isoAus(tagAus(heute) + 7);
    return { version: String(v.werte.name), ende: pl.erg.endeDatum, n: blatt.length,
      laeuft: blatt.filter((z) => z.termin.anfang <= heute && z.termin.ende >= heute && z.fortschritt < 100),
      bald: blatt.filter((z) => z.termin.anfang > heute && z.termin.anfang <= bis).sort((a, b) => (a.termin.anfang < b.termin.anfang ? -1 : 1)) };
  });
  const tagebuch = createMemo(() => {
    if (!darf('tagesbericht', 'lesen')) return null;
    const berichte = lebende('tagesbericht').filter((b) => b.werte.projekt === p.projekt).sort((a, b) => (String(a.werte.datum) < String(b.werte.datum) ? 1 : -1));
    const offen = lebende('bericht_eintrag').filter((e) => e.werte.projekt === p.projekt && (e.werte.art === 'mangel' || e.werte.art === 'aufgabe') && e.werte.erledigt !== true);
    return { letzter: berichte[0], anzahl: berichte.length, maengel: offen.filter((e) => e.werte.art === 'mangel'), aufgaben: offen.filter((e) => e.werte.art === 'aufgabe').sort((a, b) => String(a.werte.frist || '9999').localeCompare(String(b.werte.frist || '9999'))) };
  });
  const Kachel = (k: { titel: string; app: string; ansicht?: string; children: JSX.Element }) =>
    <button class="projektkachel" onClick={() => p.onApp(k.app, k.ansicht)}><strong>{k.titel}</strong>{k.children}</button>;
  return (
    <section class="projektkacheln" aria-label={`Stand im Projekt ${name()}`}>
      <h2>{name()}</h2>
      <div class="projektkacheln-reihe">
        <Show when={plan()} fallback={<Show when={darf('vorgang', 'lesen')}><Kachel titel="Bauzeitenplan" app="bauzeitenplan"><span class="still-text">Noch kein Bauzeitenplan – mit dem Assistenten in einer Minute angelegt.</span></Kachel></Show>}>{(pl) => (
          <Kachel titel={`Bauzeitenplan · ${pl().version}`} app="bauzeitenplan">
            <span class="still-text">{pl().n} Leistungen · Ende {kurz(pl().ende)}</span>
            <h4>Läuft gerade</h4>
            <For each={pl().laeuft.slice(0, 4)} fallback={<span class="still-text">nichts</span>}>{(z) => <span class="pk-zeile"><i style={{ background: z.farbe }} />{z.name}<em>bis {kurz(z.termin.ende)}</em></span>}</For>
            <Show when={pl().bald.length}><h4>Beginnt in 7 Tagen</h4><For each={pl().bald.slice(0, 3)}>{(z) => <span class="pk-zeile"><i style={{ background: z.farbe }} />{z.name}<em>ab {kurz(z.termin.anfang)}</em></span>}</For></Show>
          </Kachel>
        )}</Show>
        <Show when={tagebuch()}>{(t) => (
          <>
            <Kachel titel="Bautagebuch" app="bautagebuch">
              <span class="still-text">{t().anzahl ? `${t().anzahl} Berichte · zuletzt Nr. ${t().letzter!.werte.nummer ?? ''} vom ${kurz(String(t().letzter!.werte.datum ?? ''))}` : 'Noch keine Tagesberichte.'}</span>
              <Show when={t().letzter && String(t().letzter!.werte.datum) < heute}><span class="pk-hinweis">Heute noch kein Bericht</span></Show>
            </Kachel>
            <Kachel titel={`Offen: ${t().maengel.length} Mängel, ${t().aufgaben.length} Aufgaben`} app="bautagebuch" ansicht="maengel">
              <For each={[...t().maengel, ...t().aufgaben].slice(0, 5)} fallback={<span class="still-text">Alles erledigt.</span>}>{(e) => (
                <span class="pk-zeile" classList={{ ueberfaellig: !!e.werte.frist && String(e.werte.frist) < heute }}><i classList={{ mangel: e.werte.art === 'mangel' }} />{String(e.werte.text ?? '')}<em>{e.werte.frist ? kurz(String(e.werte.frist)) : ''}</em></span>
              )}</For>
            </Kachel>
          </>
        )}</Show>
      </div>
    </section>
  );
}
