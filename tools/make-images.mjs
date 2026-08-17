/* Génère les images statiques (OG, icônes, visuel produit) à partir du site lui-même.
   Usage : node tools/make-images.mjs http://127.0.0.1:8099
   Nécessite Playwright + Chromium (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers). */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] || 'http://127.0.0.1:8099';
const img = join(racine, 'assets/img');

const navigateur = await chromium.launch();

/* ---- 1. Image de partage 1200×630 : on rejoue le hero du site --------- */
const og = await navigateur.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await og.goto(base + '/tools/og.html', { waitUntil: 'networkidle' });
await og.waitForTimeout(700);
await og.screenshot({ path: join(img, 'og-citrosetoise.png') });

/* ---- 2. Icône 180×180 -------------------------------------------------- */
const icone = await navigateur.newPage({ viewport: { width: 180, height: 180 } });
await icone.goto(base + '/favicon.svg', { waitUntil: 'networkidle' });
await icone.screenshot({ path: join(img, 'apple-touch-icon.png') });

/* ---- 3. Logo et packshot pour les données structurées ------------------ */
const site = await navigateur.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await site.goto(base + '/index.html', { waitUntil: 'networkidle' });
await site.waitForTimeout(1400);
const boite = await site.evaluate(() => {
  const r = document.querySelector('[data-bottle]').getBoundingClientRect();
  return { x: r.x - 24, y: r.y - 16, width: r.width + 48, height: r.height + 40 };
});
await site.screenshot({ path: join(img, 'bouteille-citrosetoise-33cl.png'), clip: boite, omitBackground: false });

const logo = await navigateur.newPage({ viewport: { width: 512, height: 512 } });
await logo.goto(base + '/tools/logo.html', { waitUntil: 'networkidle' });
await logo.waitForTimeout(300);
await logo.screenshot({ path: join(img, 'logo-citrosetoise.png') });

await navigateur.close();
console.log('images écrites dans assets/img');
