// Restaure une sauvegarde JSON (akatsuki-AAAA-MM-JJ-HH-MM.json.gz) dans la base configurée.
// Site arrêté d'abord (pm2 stop aakatsuki), puis :
//   node --env-file=<chemin>/.env server/restore.js <fichier.json.gz> --oui
// Remplace TOUTES les données actuelles par celles de la sauvegarde.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { openStore, COLLECTIONS } from './store.js';

const [file, confirm] = process.argv.slice(2);
if (!file) { console.error('Usage : node server/restore.js <sauvegarde.json.gz> --oui'); process.exit(1); }
const dump = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));
for (const c of COLLECTIONS) if (c === 'challenges') dump[c] ||= []; else if (!Array.isArray(dump[c])) { console.error(`Sauvegarde invalide : ${c} manquant.`); process.exit(1); }
console.log(`Sauvegarde du ${dump.at} : ${dump.users.length} membres, ${dump.transactions.length} opérations de points.`);
if (confirm !== '--oui') { console.log('Ajoute --oui pour remplacer les données actuelles.'); process.exit(0); }

const store = await openStore({ url: process.env.DATABASE_URL || '', dir: resolve(process.env.DATA_DIR || 'data') });
await store.replaceAll(dump);
await store.close();
console.log('Données restaurées. Redémarre le site (pm2 restart aakatsuki).');
