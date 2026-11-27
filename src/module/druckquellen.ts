// Alle Druckquellen der Module (berechnete Tabellen im Ausdruck) – Browser und Server lesen dieselbe Liste.
import type { Druckquelle } from '../kern/druck';
import { DRUCKQUELLEN as ava } from './ava/freigabe';
import { DRUCKQUELLEN as tueren } from './ava/tueranlage';

export const DRUCKQUELLEN: Record<string, Druckquelle> = { ...ava, ...tueren };
