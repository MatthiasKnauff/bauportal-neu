// Start des Programms: Datenbank verbinden, Schema und Grundausstattung herstellen, Server hochfahren.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { register } from '../module';
import { schemaAnlegen, verbinden, warteAufDb } from './db';
import { baueServer } from './server';
import { grundausstattung } from './grundausstattung';

const hier = path.dirname(fileURLToPath(import.meta.url));
const db = verbinden(process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5433/bp_dev');
await warteAufDb(db);
await schemaAnlegen(db, register);
await grundausstattung(db, register);
const app = await baueServer({
  db,
  register,
  version: process.env.APP_VERSION ?? 'dev',
  umgebung: process.env.APP_ENV ?? 'dev',
  uiVerzeichnis: process.env.UI_DIR ?? path.join(hier, 'ui'),
});
const port = Number(process.env.PORT ?? 8000);
await app.listen({ host: '0.0.0.0', port });
console.log(`Bauportal läuft auf Port ${port} (${process.env.APP_ENV ?? 'dev'}, ${process.env.APP_VERSION ?? 'dev'})`);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => { await app.close(); await db.end(); process.exit(0); });
}
