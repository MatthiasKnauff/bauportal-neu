// Der Bauzeitenplan eines Projekts, wie ihn andere Apps lesen (Startseite, Bautagebuch): aus den Einträgen im Gerät gerechnet.
import type { Zeile } from '../kern/befehl';
import { planAus, type Plan } from '../module/bauzeitenplan/plan';
import { gemerkt, lebende } from './unterbau/abgleich';

/** Die Versionen des Bauzeitenplans eines Projekts. */
export const planVersionen = (projekt: string): Zeile[] => lebende('version').filter((v) => v.werte.projekt === projekt && v.werte.bereich === 'bauzeitenplan');
/** Der Plan einer Version – je Version gemerkt, bis sich Leistungen, Verknüpfungen oder Kalender ändern. */
export const planDerVersion = (version: string): Plan =>
  gemerkt(['vorgang', 'verknuepfung', 'zeitplan', 'freier_tag'], `plan:${version}`, () => {
    const in_ = (o: string) => lebende(o).filter((x) => x.werte.version === version);
    return planAus({ vorgaenge: in_('vorgang'), links: in_('verknuepfung'), zeitplan: in_('zeitplan')[0]?.werte, frei: in_('freier_tag'), land: '', heute: new Date().toLocaleDateString('sv') });
  });
