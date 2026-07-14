# FitTrack

App fitness personnelle : suivi de la dépense calorique quotidienne, objectif de déficit, et recettes.

## Fonctionnalités

- **Déficit visé** : choisis 500 / 750 / 1000 kcal de déficit journalier (avec estimation en kg/semaine).
- **Métabolisme** : encode ton métabolisme de base (BMR), ton mouvement quotidien (NEAT) et ta dépense de digestion (TEF) — mise à jour automatique, pas de bouton à cliquer.
- **Activités** : ajoute des activités (Marche, Marche sur tapis, Tapis incliné 6/8/10/12 %, Stepper, Entraînement de force, Vélo de ville). Les kcal/h de chaque activité sont fixées par toi dans l'onglet « Réglages des activités ».
- **Résumé** : dépense totale (TDEE) du jour et kcal à consommer pour tenir ton déficit.
- **Recettes** : importe une recette depuis un lien ou un texte collé — Claude en extrait les ingrédients, kcal, protéines et étapes. Quantités et portions sont modifiables (kcal recalculées au prorata).

## Stack

- Backend : Node.js, Express, SQLite (`better-sqlite3`), API Anthropic (`@anthropic-ai/sdk`) pour l'import de recettes
- Frontend : React (Vite)

## Lancer le projet

### 1. Clé API Anthropic (pour l'import de recettes)

```bash
cd server
cp .env.example .env
# puis édite .env et remplace par ta vraie clé ANTHROPIC_API_KEY
```

Sans cette clé, tout le reste de l'app fonctionne normalement — seul l'import de recettes échouera.

### 2. API

```bash
cd server
npm install
npm run dev   # http://localhost:4000
```

### 3. Interface

```bash
cd client
npm install
npm run dev   # http://localhost:5173
```

Le frontend proxy les appels `/api/*` vers le serveur sur le port 4000 (voir `client/vite.config.js`).
