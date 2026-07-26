# Prompt design — Madame Cruise (refonte "waw")

Copier-coller le bloc ci-dessous dans Claude (mode design / artifact HTML) ou un outil de design AI.

---

Tu es un directeur artistique de classe mondiale, spécialiste du luxe féminin et de l'expérience web cinématographique. Tu vas redessiner le site de Madame Cruise pour qu'il provoque un "waw" immédiat à la première seconde, tout en restant élégant, crédible et profondément humain. Pas de surenchère gratuite : chaque effet doit servir l'émotion de la marque.

## La marque
Madame Cruise est la première marque de charters de yacht 100% féminins à Dubai. Équipage entièrement féminin, protocole de confidentialité, halal à bord, capitaines licenciées. Le manifeste : "The sea, finally hers." (La mer, enfin à elle.) La cliente : une femme du Golfe ou expat, souvent voilée, qui veut nager, danser, respirer, sans regard masculin. Le sentiment central n'est pas le luxe froid, c'est la libération intime, le soulagement, la liberté retrouvée.

## L'émotion à transmettre
Intimité, sécurité, exhale. Le golden hour. L'eau enfin à soi. Un secret bien gardé. Ce n'est pas "regardez comme c'est riche", c'est "ici, tu peux enfin être toi".

## Ce que je veux (le "waw")
Un site ultra moderne, éditorial, cinématographique. Pense à un croisement entre un magazine de mode haut de gamme, une marque de parfum de niche, et une expérience scrollytelling. Surprends-moi avec une idée d'interaction forte, pas juste de jolies sections.

Pistes à explorer (choisis et pousse les meilleures, n'empile pas tout) :
- Hero plein écran cinématographique, révélation lente, typographie display surdimensionnée (Cormorant Garamond) qui s'anime à l'arrivée.
- Un dégradé "heure de la journée" qui glisse du matin au golden hour au crépuscule au fil du scroll.
- Une métaphore d'interaction issue du protocole de confidentialité : un "rideau" qui s'écarte pour révéler le pont privé (le screening de la marque devient une interaction).
- Une timeline horizontale ou un parcours scroll-driven qui raconte une croisière, étape par étape.
- Micro-interactions liées à l'eau : ondulation discrète au curseur, parallax doux, reflets.
- Grille éditoriale asymétrique, beaucoup d'air, rythme lent et premium.
- Le module "by the seat" comme une vraie expérience (choisir sa place sur le pont) plutôt qu'un formulaire.

## Contraintes non négociables
- ACCESSIBILITÉ DALTONIENNE : le fondateur est daltonien. Contraste élevé obligatoire, texte sombre sur fond clair par défaut, jamais d'info portée par la couleur seule (toujours doubler par forme, icône ou texte).
- PUDEUR ET RESPECT CULTUREL : public musulman, beaucoup de femmes voilées. Élégant et sensuel par l'atmosphère, jamais par l'exposition des corps. Pas d'imagerie suggestive.
- PAS DE VISAGES GÉNÉRÉS PAR IA. Les portraits de l'équipage, les gros plans, la famille, la créatrice sont des emplacements réservés à de vraies photos. Utilise des blocs élégants ou des photos d'ambiance sans visage (mer, pont, mains, détails, skyline) à la place.
- RESPECTER `prefers-reduced-motion` : toutes les animations doivent se désactiver proprement.
- Bilingue à venir EN / AR / FR, donc penser layout compatible RTL (utiliser des propriétés logiques, pas left/right en dur).
- Performance : le site doit rester rapide et léger, animations en CSS/GPU quand possible.

## Direction visuelle existante (à élever, pas à jeter)
- Palette : navy profond (#1C2B4A, #14213A), crème chaud (#FBF5EF), blush (#C98A8E, #E3B9BB), or doux (#C9A86A, #E4D2AE), encre (#2B2F3A). Tu peux raffiner, mais garde l'ADN warm coastal luxury (chaud, féminin, marin), pas le bleu tech froid.
- Typo : Cormorant Garamond (serif display) + Inter (sans). Tu peux proposer mieux si c'est plus fort.
- Formes douces, arrondies, ombres soyeuses.

## Contenu réel à intégrer
- Slogan : "The sea, finally hers."
- 6 expériences : Ladies' Day Cruise, Sunset Brunch Cruise, Halal Bachelorette, Henna & Spa at Sea, Private Family Charter, Creator Photoshoot Package.
- 2 façons de réserver : charter privé (tout le yacht) et "by the seat" (place sur une croisière partagée entre femmes, dès 550 AED/place).
- Piliers privacy : mouillage rideauté, no-drone, photographe femme en option, espace de prière à bord.
- CTA principaux : WhatsApp et formulaire d'inquiry. Bouton compte membre en haut à droite.

## Livrable attendu
1. Une direction artistique claire en quelques lignes (le concept, le "pourquoi waw").
2. Le redesign de la page d'accueil en HTML + CSS (et JS si l'interaction le demande), responsive, accessible, prêt à intégrer dans une stack Vite multi-page vanilla.
3. Le détail de l'interaction signature qui crée le "waw", expliquée.
4. Des notes sur comment décliner sur les autres pages.

Commence par me proposer LE concept et l'interaction signature avant de tout coder, pour qu'on valide la direction. Surprends-moi, mais reste au service de l'intimité et de la liberté de ces femmes.
