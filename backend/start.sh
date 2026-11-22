#!/bin/sh
set -eu

echo "[MISAINA] Démarrage du backend (pré-initialisation + serveur)..."

# 1. Préparer les répertoires locaux de stockage (inbox, archive, quarantaine)
mkdir -p ./data/inbox ./data/archive ./data/quarantine

if [ -n "${INBOX_DIR:-}" ]; then
  if mkdir -p "$INBOX_DIR" 2>/dev/null; then
    echo "[MISAINA] Dossier inbox configuré : $INBOX_DIR"
  else
    echo "[MISAINA] Avertissement : INBOX_DIR ($INBOX_DIR) non accessible en écriture, repli vers ./data/inbox"
  fi
fi

# 2. Remplacement du Pre-Deploy Command (mode gratuit Render) :
#    initialisation / migration idempotente du schéma PostgreSQL avant lancement du serveur
#    (initDb.js gère aussi l'absence de DATABASE_URL ou la lecture depuis .env)
node dist/src/initDb.js

# 3. Lancement du serveur HTTP principal (exec pour transmettre SIGTERM/SIGINT)
echo "[MISAINA] Lancement du serveur API sur le port ${BACKEND_PORT:-${PORT:-4000}}..."
exec node dist/src/server.js
