// Bauzeitenplan → Arbeitszeit & Feiertage: Projektanfang, Arbeitswoche und Feiertage des Plans einer Version – mit den
// Feldern aus dem Datenmodell (Baustein Feld). Gibt es noch keinen Kalender für die Version, legt die erste Änderung ihn an.
import { For } from 'solid-js';
import type { Werte } from '../kern/modell';
import { naechsterMontag } from '../module/bauzeitenplan/plan';
import { ausfuehren, sicht } from './unterbau/abgleich';
import { darf, modell, neueKennung } from './unterbau/api';
import { FeldEingabe } from './baukasten/feld';
import { feldAendern } from './baukasten/detailkarte';

export function Arbeitszeit(p: { zusammenhang: Werte }) {
  const m = () => modell('zeitplan');
  const zp = () => Object.values(sicht.zeitplan ?? {}).find((z) => !z.geloescht && z.werte.projekt === p.zusammenhang.projekt && z.werte.version === p.zusammenhang.version);
  const felder = () => m().felder.filter((f) => ['anfang', 'arbeitswoche', 'bundesland'].includes(f.name));
  return (
    <div class="arbeitszeit" aria-label="Arbeitszeit des Plans">
      <For each={felder()}>{(f) => (
        <FeldEingabe feld={f} wert={zp()?.werte[f.name] ?? (f.name === 'arbeitswoche' ? '5' : f.name === 'bundesland' ? '' : null)} gesperrt={!darf('zeitplan', 'schreiben')}
          onWert={(w) => {
            const z = zp();
            if (z) feldAendern(m(), z, f, w);
            else ausfuehren({ objekt: 'zeitplan', art: 'anlegen', objektId: neueKennung(), werte: { projekt: p.zusammenhang.projekt ?? null, version: p.zusammenhang.version ?? null, anfang: naechsterMontag(new Date().toLocaleDateString('sv')), arbeitswoche: '5', bundesland: '', notiz: '', [f.name]: w } }, `${f.titel} ändern`);
          }} />
      )}</For>
      <p class="still-text klein-text">Darunter die freien Tage dieses Plans (z. B. Betriebsurlaub, Frost) – zusätzlich zu den Feiertagen.</p>
    </div>
  );
}
