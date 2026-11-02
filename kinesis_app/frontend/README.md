# Kinesis — frontend

Application Next.js (App Router, TypeScript) du projet Kinesis. Le backend
Django reste la source des données et des fonctionnalités métier.

## Développement local

1. Installer les dépendances avec `npm install`.
2. Copier `.env.example` vers `.env.local`.
3. Vérifier que `BACKEND_API_URL` pointe vers le serveur Django, par défaut
   `http://127.0.0.1:8000`.
4. Lancer `npm run dev`, puis ouvrir <http://localhost:3000>.

Sous PowerShell sur Windows, utiliser `npm.cmd` si la politique d’exécution
bloque le script `npm.ps1` : `npm.cmd install`, puis `npm.cmd run dev`.

La page d’accueil charge les villes depuis `/api/v1/villes/` et les départs
depuis `/api/v1/voyages/`. Les routes Next.js `/api/villes` et `/api/voyages`
servent de proxy serveur vers Django ; le navigateur n’appelle donc pas
directement l’API Django.

La page `/connexion` permet de créer un compte voyageur ou de se connecter.
Les routes `/api/auth/inscription`, `/api/auth/connexion` et
`/api/auth/deconnexion` relaient les requêtes vers les routes Django
correspondantes. Les jetons de connexion sont conservés dans des cookies
`HttpOnly`, inaccessibles au JavaScript du navigateur.

Après connexion, `/espace-voyageur` restaure la session avec
`/api/auth/session` et affiche les réservations réelles via `/api/reservations`.
Le renouvellement des jetons expirés est effectué côté serveur ; les jetons ne
sont jamais exposés au navigateur.

Le parcours voyageur permet aussi de modifier son profil et sa photo via
`/api/auth/profile`, de réserver un départ, d’initier un paiement FedaPay et de
retrouver ses réservations et billets dans l’espace. Les actions de réservation,
paiement et annulation sont relayées côté serveur vers les API Django.
Pour que FedaPay ramène le voyageur vers son profil et que l’état du paiement
soit actualisé au retour, configure `FEDAPAY_CALLBACK_URL` dans le backend
avec l’URL publique `https://<domaine-frontend>/paiement/retour`.

## Vérifications

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
