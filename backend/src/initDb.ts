import { journalRepo } from "./journal";
import { checkPgHealth, closePgPool, isPgEnabled } from "./pgStore";

async function main() {
  if (!isPgEnabled()) {
    console.log("[initDb] Aucun DATABASE_URL configuré : démarrage en mode mémoire/disque.");
    return;
  }

  const maxAttempts = Number(process.env.DB_INIT_MAX_ATTEMPTS || 5);
  const retryDelayMs = Number(process.env.DB_INIT_RETRY_DELAY_MS || 3000);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await journalRepo.ensureReady();
      await journalRepo.flushPg();
      const health = await checkPgHealth();
      if (health.ok) {
        console.log(
          `[initDb] Schéma PostgreSQL vérifié, migré et initialisé (tentative ${attempt}/${maxAttempts}).`
        );
        await closePgPool();
        return;
      }
    } catch (err) {
      console.warn(
        `[initDb] Erreur lors de l'initialisation PostgreSQL (tentative ${attempt}/${maxAttempts}):`,
        err instanceof Error ? err.message : err
      );
    }

    if (attempt < maxAttempts) {
      console.log(`[initDb] Nouvel essai dans ${Math.round(retryDelayMs / 1000)}s...`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  await closePgPool();
  if (process.env.ALLOW_PG_BOOT_FALLBACK === "true") {
    console.warn(
      "[initDb] PostgreSQL inaccessible après plusieurs tentatives ; poursuite en mode dégradé (ALLOW_PG_BOOT_FALLBACK=true)."
    );
    return;
  }

  console.error(
    "[initDb] Impossible d'initialiser PostgreSQL après plusieurs tentatives. Vérifiez DATABASE_URL et PGSSL."
  );
  process.exit(1);
}

main().catch(async (err) => {
  console.error("[initDb] Échec critique:", err);
  await closePgPool().catch(() => undefined);
  process.exit(1);
});
