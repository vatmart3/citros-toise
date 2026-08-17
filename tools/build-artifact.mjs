/* Assemble une version autonome du site en un seul fichier HTML :
   polices, CSS et JS embarqués, aucune requête réseau.
   Sert à publier une preview partageable — le site de production reste
   la version éclatée (index.html + assets/), meilleure pour le cache.

   Usage : node tools/build-artifact.mjs [chemin/sortie.html]                */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const sortie = process.argv[2] || join(racine, 'dist/citrosetoise.html');
const lire = (p) => readFileSync(join(racine, p), 'utf8');

/* --- 1. Polices : on n'embarque que le sous-ensemble latin (moitié du poids) */
let polices = lire('assets/css/fonts.css')
  .split('@font-face')
  .filter((bloc) => bloc.includes('-latin.woff2'))
  .map((bloc) => '@font-face' + bloc.slice(0, bloc.indexOf('}') + 1))
  .join('\n');

for (const fichier of readdirSync(join(racine, 'assets/fonts')).filter((f) => f.endsWith('.woff2'))) {
  const b64 = readFileSync(join(racine, 'assets/fonts', fichier)).toString('base64');
  polices = polices.replaceAll(
    `url("../fonts/${fichier}")`,
    `url("data:font/woff2;base64,${b64}")`
  );
}

/* --- 2. Corps de page : l'hôte fournit <html>/<head>/<body> ---------------- */
const html = lire('index.html');
const corps = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'))
  .replace(/<script src="[^"]*"[^>]*><\/script>\s*/g, '');

const jsonLd = html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/)[0];

const page = `<title>La Citrosétoise</title>
${jsonLd}
<style>
${polices}
${lire('assets/css/main.css')}
</style>
${corps}
<script>
${lire('assets/js/app.js')}
</script>
`;

mkdirSync(dirname(sortie), { recursive: true });
writeFileSync(sortie, page);
console.log(`${sortie} — ${(Buffer.byteLength(page) / 1024 / 1024).toFixed(2)} Mo`);
