# La Citrosétoise — site vitrine

Site one-page pour la citronnade artisanale de Sète. Sans framework, sans dépendance,
sans requête tierce : trois fichiers (HTML / CSS / JS), des polices auto-hébergées et
une bouteille en 3D construite en CSS.

```
index.html                 la page (contenu + SEO + gabarits d'étiquette)
assets/css/main.css        feuille de style unique
assets/css/fonts.css       @font-face auto-hébergés
assets/js/app.js           moteur d'interface (une seule boucle rAF)
assets/fonts/              Playfair Display + Montserrat (OFL), latin + latin-ext
assets/img/                image de partage, icônes, packshot — régénérables
tools/build-artifact.mjs   assemble une version « un seul fichier »
tools/make-images.mjs      régénère assets/img à partir du site
```

## Faire tourner le site en local

Le site est statique : n'importe quel serveur suffit. Les chemins étant absolus
(`/assets/...`), il faut le servir à la racine, pas l'ouvrir en `file://`.

```bash
npx http-server -p 8099 -c-1 .
# puis http://127.0.0.1:8099
```

## La bouteille en 3D, comment ça marche

Pas de WebGL, pas de bibliothèque. Un corps de révolution garde la même silhouette
quand il tourne sur son axe : la silhouette (verre, liquide, reflets, capsule) est
donc un SVG **fixe**, et seule l'étiquette tourne.

Cette étiquette est un vrai cylindre CSS : `assets/js/app.js` construit N lamelles
(`.slat`) posées en cercle via `rotateY(i·360/N) translateZ(R)`. Chaque lamelle
contient une copie complète de l'étiquette dépliée (`<template id="tpl-label">`),
décalée horizontalement de `-i·largeur` et rognée par `overflow: hidden` — la
typographie reste donc du vrai texte HTML, net à toutes les tailles, et l'impression
s'enroule réellement autour du verre.

L'éclairage est recalculé à chaque image : l'opacité de l'ombre de chaque lamelle
suit le cosinus de son angle, la lumière reste fixe pendant que la bouteille tourne.
Les lamelles qui passent derrière sont estompées à 7 % — ce qu'on verrait à travers
le liquide.

Trois réglages, dans `index.html` :

| attribut       | rôle                                          |
| -------------- | --------------------------------------------- |
| `data-radius`  | rayon du cylindre, en unités du viewBox (240×620) |
| `data-slats`   | nombre de lamelles (18 = bon compromis netteté / DOM) |
| `data-shade`   | force de l'ombrage sur ce cylindre            |

La hauteur et la position verticale des cylindres sont dans `main.css`
(`.cyl--label`, `.cyl--neck`) et suivent la silhouette (`#clip-bottle`).

## Le défilement

Une seule boucle `requestAnimationFrame` lit la progression de la scène épinglée
(`.scene` sur 620 vh) et la lisse par interpolation — le défilement natif n'est pas
détourné, seules les valeurs animées le sont. Cette progression pilote :

- la rotation (3 tours complets sur la scène) ;
- la descente, l'échelle et le décalage latéral de la bouteille ;
- le fondu du paysage d'ouverture vers le bleu nuit de la marque ;
- l'enchaînement des cinq chapitres.

À mi-parcours (`p = 0.5`, soit 540°), c'est l'étiquette arrière qui fait face au
lecteur — au moment précis où le chapitre « Cinq ingrédients » s'affiche. Si vous
changez le nombre de tours (`TOURS` dans `app.js`), cette synchronisation saute.

`prefers-reduced-motion` bascule la page en pile classique (`.no-motion`) : plus
d'épinglage, plus de rotation, tous les chapitres visibles.

## Référencement

- balises canonique, hreflang, Open Graph et Twitter Card ;
- JSON-LD : `Organization`, `WebSite`, `Product`, `FAQPage` ;
- `robots.txt` + `sitemap.xml` (avec l'image produit) ;
- HTML sémantique, un seul `h1`, hiérarchie de titres continue, `aria-label` sur les
  repères, lien d'évitement, focus visible ;
- polices auto-hébergées et préchargées, zéro script tiers, zéro cookie.

**Avant mise en ligne**, remplacer `https://www.lacitrosetoise.fr/` par le domaine
réel dans `index.html` (canonical, hreflang, Open Graph, JSON-LD), `sitemap.xml` et
`robots.txt`.

## Contenu à valider

Le site est livré avec un contenu de marque plausible mais **à faire relire** :
dates de l'historique (1953, 1978, 2004), pourcentages de la recette, valeurs
nutritionnelles, prix de la gamme, points de vente, adresse et e-mail de contact.
Tout est en clair dans `index.html`.

## Régénérer les images

`assets/img/` est produit à partir du site lui-même (Chromium via Playwright), pour
que l'image de partage ne diverge jamais du rendu réel :

```bash
npx http-server -p 8099 -c-1 . &
node tools/make-images.mjs http://127.0.0.1:8099
```

## Version « un seul fichier »

Pour envoyer une preview sans hébergement, ou publier la page telle quelle :

```bash
node tools/build-artifact.mjs dist/citrosetoise.html   # ~0,5 Mo, tout embarqué
```

## Déploiement

`.github/workflows/pages.yml` publie la racine du dépôt sur GitHub Pages à chaque
push sur `main` (Settings → Pages → Source : GitHub Actions).

## Licences

Playfair Display et Montserrat sont sous SIL Open Font License 1.1 (redistribution
autorisée). Le reste — code, illustrations SVG, textes — appartient au projet.
