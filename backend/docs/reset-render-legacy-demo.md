# Réinitialiser l'ancien espace de démonstration Render

La réinitialisation ciblée de l'ancien tenant `tenant-operations-sahel-dakar` est opt-in et idempotente. Elle couvre PostgreSQL lorsqu'il est configuré et le stockage local (journal, utilisateur de démo, index RAG, MEAL, inbox, archive et quarantaine).

1. Faites une sauvegarde du PostgreSQL Render et vérifiez que les données de ce tenant sont bien des données de démonstration. Prévoyez une fenêtre sans trafic pendant le déploiement.
2. Dans l'environnement du service Render, définissez `RESET_LEGACY_DAKAR_DEMO=1`.
3. Déployez la version qui contient ce script et vérifiez les logs `[reset-demo]` avant de réutiliser l'espace.
4. Retirez `RESET_LEGACY_DAKAR_DEMO` de l'environnement Render. Les marqueurs en base et sur disque empêchent aussi une seconde exécution si le service redémarre avant le retrait de la variable.

Le script ne supprime aucun autre tenant. Il conserve les comptes et migre le compte de démonstration `u-3` vers le département Madagascar, puis l'application recrée ses données de départ au démarrage. Il ne faut pas réutiliser cette procédure pour effacer des espaces opérationnels.
