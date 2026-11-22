# Misaina Cognition — Guide d'installation

Moteur de connaissance augmentée (RAG) pour entreprise.
Stack : Next.js 15 + ASP.NET Core 9 + PostgreSQL + Qdrant + LLM.

## 1. Prérequis
- .NET 9 SDK
- Node.js 20+
- PostgreSQL 16 (pgAdmin) — base `cognition`, user `postgres`
- (optionnel) Clé API OpenAI pour embeddings/LLM réels

## 2. Base de données
La base `cognition` doit exister. Appliquer le schéma (compatible PostgreSQL standard, sans pgvector) :
```powershell
$env:PGPASSWORD="12345"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost -p 5432 -d cognition -f "backend\Scripts\schema.sql"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost -p 5432 -d cognition -f "backend\Scripts\migrate.sql"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost -p 5432 -d cognition -f "backend\Scripts\create_reset_tokens.sql"
```
Chaîne de connexion par défaut : `Host=localhost;Port=5432;Database=cognition;Username=postgres;Password=12345`.

## 3. Lancement en développement
### Backend
```bash
cd backend
dotnet restore
dotnet run --project Cognition.API --urls "http://localhost:5000"
```
Un admin est seedé au premier démarrage : `admin@misaina.com` / `Admin123!`
Inscriptions possibles via `/register` (chaque utilisateur a son propre espace).

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Interface sur http://localhost:3000 (redirige `/api` vers le backend).

## 4. Configuration (appsettings.json)
| Clé | Description |
|-----|-------------|
| `AI:Embedding:ApiKey` | si vide → embeddings locaux (hors-ligne) |
| `AI:LLM:ApiKey` | si vide → LLM de repli local (cite le contexte) |
| `Vector:QdrantUrl` | URL Qdrant (sinon fallback in-memory) |
| `ConnectionStrings:Default` | Chaîne PostgreSQL |
| `App:BaseUrl` | URL frontend pour les liens email |

## 5. Authentification & sécurité
- Inscription, Connexion, Déconnexion, Mot de passe oublié, Réinitialisation, Vérification email
- JWT (30 min) + Refresh Token (7 jours)
- RBAC : ADMIN / MANAGER / EMPLOYEE / GUEST avec permissions (UPLOAD_DOCUMENT, VIEW_DOCUMENT, ASK_AI, MANAGE_USERS, VIEW_ANALYTICS, GENERATE_DOCUMENT)
- **Isolation stricte** : chaque utilisateur ne voit QUE ses documents, conversations et documents générés (sauf ADMIN). Les routes backend et frontend sont protégées.

## 6. Fonctionnalités
- Pipeline RAG : extraction (PDF/Word/Excel/PowerPoint/Text) → chunking intelligent → embeddings → recherche hybride (BM25 + vectorielle) → re-ranking → agent multi-étapes (Planner → Retriever → Verifier → Answer)
- Chat IA avec sources, extraits, pages, niveau de confiance
- **Générateur de documents Word** : transforme une réponse IA en `.docx`
- Dashboard personnalisé par utilisateur (ses stats, activité récente)
- Thème clair / sombre, sidebar adaptatif au rôle

## 7. API principales
- POST /api/auth/login | /register | /refresh | /logout | /forgot-password | /reset-password | GET /auth/verify-email | GET /auth/me
- POST /api/documents/upload | GET /api/documents | GET /api/documents/{id} | DELETE /api/documents/{id}
- POST /api/chat/question | GET /api/chat/history
- POST /api/chat/generate-document | GET /api/chat/download/{id}
- GET /api/dashboard/mine | GET /api/dashboard/statistics | GET /api/users

## 8. Tests
```bash
cd backend && dotnet test
```
