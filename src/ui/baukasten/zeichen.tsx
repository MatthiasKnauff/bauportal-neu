// Baustein „Zeichen“: die Symbole des Bauportals – eine Linien-Sammlung (Lucide, ISC-Lizenz), unter deutschen Namen.
// Wer ein Symbol braucht, nimmt es hier; neue kommen in die Liste unten. Gezeichnet in der Textfarbe (currentColor).
import type { JSX } from 'solid-js';
import {
  ArrowRightLeft, Blocks, BookOpen, BookUser, Building2, Calendar, CalendarClock, CalendarPlus, Camera, ChartGantt, Check, ChevronDown, ChevronLeft,
  ChevronRight, CircleCheck, CircleHelp, ClipboardCheck, ClipboardList, Cloud, Columns3, Contact, Copy, Diamond, Download, ExternalLink, Eye,
  FileDown, FileText, FileUp, Flag, Folder, FolderKanban, GitBranch, Grid3x3, History, House, ImagePlus, Info, KeyRound, LayoutGrid, Library,
  List, ListPlus, ListTree, Mail, MapPin, Merge, Mic, NotebookPen, NotebookText, PanelLeft, PanelRightClose, Paintbrush, Pencil, Plus, Printer,
  Redo2, RefreshCw, Search, Send, Settings, Share2, ShieldCheck, Sparkles, StickyNote, Table, Trash2, TriangleAlert, Undo2, Upload, UserPlus,
  Users, Workflow, X, Route, Spline, ZoomIn, ZoomOut, Pin, PinOff, type IconNode,
} from 'lucide';

const ZEICHEN = {
  // allgemein
  zurueck: Undo2, wieder: Redo2, neu: Plus, loeschen: Trash2, bearbeiten: Pencil, kopieren: Copy, schliessen: X, fenster: ExternalLink,
  zuklappen: PanelRightClose, suche: Search, aktualisieren: RefreshCw, hilfe: CircleHelp, info: Info, apps: Grid3x3, einstellungen: Settings,
  links: ChevronLeft, rechts: ChevronRight, runter: ChevronDown, haken: Check, erledigt: CircleCheck, ansehen: Eye, schluessel: KeyRound,
  // Ansicht und Liste
  gliederung: PanelLeft, tabelle: Table, kacheln: LayoutGrid, spalten: Columns3, liste: List, baum: ListTree, aufraeumen: Paintbrush,
  zusammenfuehren: Merge, tauschen: ArrowRightLeft, verlauf: History, kalender: Calendar, arbeitszeit: CalendarClock,
  // Ausgabe und Austausch
  pdf: FileText, drucken: Printer, export: Download, import: Upload, datei_hoch: FileUp, datei_runter: FileDown, senden: Mail, teilen: Share2,
  // Fachliches
  assistent: Sparkles, standort: MapPin, wetter: Cloud, diktieren: Mic, schrittweise: Send, foto: Camera, foto_neu: ImagePlus,
  bericht_neu: CalendarPlus, bericht: NotebookText, notiz: StickyNote, notiz_neu: NotebookPen, mangel: TriangleAlert, aufgabe: ClipboardCheck,
  weisung: Flag, personen: Users, person_neu: UserPlus, kontakt: Contact, adressen: BookUser, projekte: FolderKanban, dateien: Folder,
  gebaeude: Building2, katalog: BookOpen, kataloge: Library, version: GitBranch, meilenstein: Diamond, gruppe_neu: ListPlus, plan: ChartGantt,
  anheften: Pin, loesen: PinOff, ablauf: Workflow, kritisch: Route, pfeile: Spline, groesser: ZoomIn, kleiner: ZoomOut, bausteine: Blocks, pruefung: ShieldCheck, liste_aufgaben: ClipboardList, start: House,
} satisfies Record<string, IconNode>;
export type Zeichenname = keyof typeof ZEICHEN;
export const istZeichen = (n: string): n is Zeichenname => n in ZEICHEN;

const attr = (a: Record<string, unknown>) => Object.entries(a).map(([k, w]) => `${k}="${String(w)}"`).join(' ');
const inhalt = new Map<string, string>();
const innen = (n: Zeichenname) => inhalt.get(n) ?? (inhalt.set(n, ZEICHEN[n].map(([t, a]) => `<${t} ${attr(a)}/>`).join('')), inhalt.get(n)!);

export function Zeichen(p: { name: Zeichenname; groesse?: number; class?: string; titel?: string }): JSX.Element {
  return (
    <svg class={`zeichen ${p.class ?? ''}`} width={p.groesse ?? 18} height={p.groesse ?? 18} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden={p.titel ? undefined : 'true'} role={p.titel ? 'img' : undefined}
      aria-label={p.titel} innerHTML={innen(p.name)} />
  );
}
