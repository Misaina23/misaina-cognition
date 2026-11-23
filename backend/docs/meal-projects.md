# Suivi de projets MEAL

Le module de suivi de projets est cloisonné au couple `tenantId` + `spaceId`. Il ajoute son propre modèle métier aux collectes existantes ; les rapports importés sont également conservés dans l’archive de l’espace et les mutations sont inscrites dans le journal d’actions.

## Données et calculs

- Un projet porte un nom, des dates de début et de fin, une zone et un bailleur.
- Les objectifs sont globaux ou spécifiques. Chaque indicateur est lié à un objectif et définit une unité, une baseline, une cible, le sens souhaité, la fréquence, le caractère cumulatif ou mensuel, la source de vérification et les alias d’en-têtes.
- Les valeurs portent leur période, source, cellule Excel ou page/ligne PDF, empreinte du rapport, confiance et statut de validation.
- Les changements de cible sont historisés avec leur date d’effet, auteur et motif. Une période passée utilise la cible qui était en vigueur à cette période.
- Les progressions sont calculées en TypeScript, jamais par le LLM. Les valeurs au-delà de la cible peuvent dépasser 100 %. Si baseline = cible, une valeur qui satisfait la cible vaut 100 %, sinon 0 %.
- Les indicateurs cumulatifs ont une progression attendue linéaire entre les dates du projet. Les indicateurs mensuels ont une attente de 100 % à chaque période. Les statuts sont paramétrés dans `config/projects/meal-monitoring.yaml`.
- Les valeurs de pourcentage hors de `[0, 100]`, les sauts importants et les valeurs PDF sont envoyés à la validation humaine. Les valeurs incohérentes ne sont pas rejetées silencieusement.

## Import des rapports

1. Importez un fichier Excel `.xlsx` ou un PDF contenant du texte lisible (10 Mo maximum).
2. Vérifiez le rapprochement des en-têtes ou lignes avec les indicateurs ; choisissez une colonne de période ou indiquez la période du rapport.
3. Le même fichier, la même période et la même cellule/page ne créent pas de doublon.
4. Les valeurs Excel directement rapprochées et plausibles sont validées automatiquement ; les valeurs douteuses sont proposées. Toute valeur PDF reste en attente de validation humaine.
5. Les PDF scannés ne sont pas soumis à un OCR implicite : si aucune valeur textuelle n’est extractible, l’import échoue explicitement. Il faut d’abord produire un PDF textuel ou ajouter un OCR dédié.

## Agent, validations et annulation

Le résumé mensuel s’appuie sur `LLMProvider` et ses outils MEAL (`list_indicators`, `get_history`, `propose_value`, `flag_inconsistency`, `write_monthly_summary`). Le modèle ne peut pas valider une valeur ; une proposition signalée par l’agent reste dans la file de revue. Sans fournisseur LLM configuré, le système produit un résumé factuel déterministe.

Les mutations sont visibles dans le journal. Le rollback du module rétablit l’état précédent et doit se faire dans l’ordre inverse des actions réversibles, afin de ne pas effacer de modifications ultérieures.

## Endpoints

Tous les endpoints exigent une session et le `spaceId` est validé côté serveur.

| Méthode | Route | Permission | Usage |
|---|---|---|---|
| GET / POST | `/api/projects` | `meal:read` / `meal:ingest` | Lister / créer les projets |
| GET | `/api/projects/:projectId` | `meal:read` | Progression du projet pour une période |
| POST | `/api/projects/:projectId/objectives` | `meal:ingest` | Ajouter un objectif |
| POST | `/api/projects/:projectId/indicators` | `meal:ingest` | Ajouter un indicateur |
| POST | `/api/projects/:projectId/targets/:indicatorId` | `meal:ingest` | Modifier la cible avec date d’effet et motif |
| POST | `/api/projects/import/preview` | `meal:ingest` | Aperçu et suggestions de mapping Excel/PDF |
| POST | `/api/projects/import` | `meal:ingest` | Import idempotent des valeurs |
| POST | `/api/projects/values/decision` | `meal:validate` | Valider ou rejeter une valeur proposée |
| POST | `/api/projects/summary` | `meal:run_agent` | Analyse et résumé mensuel de l’agent |
| GET | `/api/projects/export?format=xlsx\|docx` | `meal:export` | Export Excel ou rapport Word |
| POST | `/api/projects/undo` | `meal:rollback` | Annuler la dernière action réversible |

## Exploitation

PostgreSQL crée les tables `meal_projects`, `meal_objectives`, `meal_indicators`, `meal_indicator_values`, `meal_project_actions` et `meal_project_summaries` à la première utilisation du module. En mode sans PostgreSQL, l’état est stocké dans `backend/data/meal-projects/<tenant>/<space>.json`. Les seuils de progression, de confiance et d’anomalie se règlent dans `backend/config/projects/meal-monitoring.yaml`.
