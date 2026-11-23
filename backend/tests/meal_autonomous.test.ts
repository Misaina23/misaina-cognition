import assert from "node:assert/strict";
import { runGuardianAgent } from "../src/agent/agent";
import { GenericConnector } from "../src/connectors/generic";
import { journalRepo, rollbackAgentAction } from "../src/journal";
import { createUserSpace, getPrincipalByIdOrHeader, resolveContextForUser } from "../src/tenant";

async function main() {
  const user = getPrincipalByIdOrHeader("u-1");
  const base = resolveContextForUser(user);
  const mealSpace = createUserSpace(
    base.tenantId,
    user.id,
    "Programme MEAL Nutrition & Cash",
    "Test autonome MEAL"
  );
  const ctx = resolveContextForUser(user, mealSpace.id);

  const src = journalRepo.ensureSourceForType(ctx, "generic", "KoboToolbox MEAL Terrain", {
    format: "kobo",
  });

  // Export Kobo/CommCare simulé avec erreurs MEAL injectées :
  // - 1 doublon exact (M-02 == M-01)
  // - 1 âge aberrant (M-03 : 178 ans)
  // - 1 GPS hors zone déclarée (M-04 : GPS Toamasina déclaré à Antananarivo)
  // - 1 enquêteur ENQ-04 qui copie-colle 3 fiches identiques (M-05, M-06, M-07)
  // + 6 fiches saines pour rester sous le seuil garde-fou
  const rawItems: Record<string, unknown>[] = [
    {
      _id: "M-01",
      nom_complet: "Aminata Ndiaye",
      telephone: "+261771110001",
      age: 29,
      montant: 450,
      _geolocation: [-18.8792, 47.5079],
      zone: "Antananarivo",
      enqueteur: "ENQ-01",
      q_menage: "oui",
      q_eau: "forage",
    },
    {
      _id: "M-02",
      nom_complet: "Aminata Ndiaye",
      telephone: "00261771110001",
      age: 29,
      montant: 450,
      _geolocation: [-18.8792, 47.5079],
      zone: "Antananarivo",
      enqueteur: "ENQ-01",
      q_menage: "oui",
      q_eau: "forage",
    },
    {
      _id: "M-03",
      nom_complet: "Moussa Fall",
      telephone: "+261771110003",
      age: 178,
      montant: 500,
      _geolocation: [-19.8659, 47.0333],
      zone: "Antsirabe",
      enqueteur: "ENQ-02",
      q_menage: "non",
      q_eau: "puit",
    },
    {
      _id: "M-04",
      nom_complet: "Fatou Sow",
      telephone: "+261771110004",
      age: 34,
      montant: 520,
      _geolocation: [-18.1492, 49.4023],
      zone: "Antananarivo",
      enqueteur: "ENQ-03",
      q_menage: "oui",
      q_eau: "reseau",
    },
    {
      _id: "M-05",
      nom_complet: "Awa Ba",
      telephone: "+261772220005",
      age: 32,
      montant: 600,
      _geolocation: [-18.1492, 49.4023],
      zone: "Toamasina",
      enqueteur: "ENQ-04",
      q_menage: "oui",
      q_eau: "puit",
    },
    {
      _id: "M-06",
      nom_complet: "Mariama Sy",
      telephone: "+261772220006",
      age: 32,
      montant: 600,
      _geolocation: [-18.1492, 49.4023],
      zone: "Toamasina",
      enqueteur: "ENQ-04",
      q_menage: "oui",
      q_eau: "puit",
    },
    {
      _id: "M-07",
      nom_complet: "Kadiatou Diop",
      telephone: "+261772220007",
      age: 32,
      montant: 600,
      _geolocation: [-18.1492, 49.4023],
      zone: "Toamasina",
      enqueteur: "ENQ-04",
      q_menage: "oui",
      q_eau: "puit",
    },
    {
      _id: "M-08",
      nom_complet: "Oumar Kane",
      telephone: "+261773330008",
      age: 41,
      montant: 480,
      _geolocation: [-15.7167, 46.3167],
      zone: "Mahajanga",
      enqueteur: "ENQ-05",
      q_menage: "oui",
      q_eau: "reseau",
    },
    {
      _id: "M-09",
      nom_complet: "Ibrahima Seck",
      telephone: "+261773330009",
      age: 37,
      montant: 510,
      _geolocation: [-23.35, 43.67],
      zone: "Toliara",
      enqueteur: "ENQ-06",
      q_menage: "non",
      q_eau: "forage",
    },
    {
      _id: "M-10",
      nom_complet: "Binta Touré",
      telephone: "+261773330010",
      age: 26,
      montant: 430,
      _geolocation: [-18.8792, 47.5079],
      zone: "Antananarivo",
      enqueteur: "ENQ-07",
      q_menage: "oui",
      q_eau: "reseau",
    },
    {
      _id: "M-11",
      nom_complet: "Cheikh Mbaye",
      telephone: "+261773330011",
      age: 45,
      montant: 620,
      _geolocation: [-19.8659, 47.0333],
      zone: "Antsirabe",
      enqueteur: "ENQ-08",
      q_menage: "non",
      q_eau: "puit",
    },
    {
      _id: "M-12",
      nom_complet: "Ndeye Sene",
      telephone: "+261773330012",
      age: 31,
      montant: 470,
      _geolocation: [-18.1492, 49.4023],
      zone: "Toamasina",
      enqueteur: "ENQ-09",
      q_menage: "oui",
      q_eau: "forage",
    },
    {
      _id: "M-13",
      nom_complet: "Modou Ndoye",
      telephone: "+261773330013",
      age: 38,
      montant: 550,
      _geolocation: [-15.7167, 46.3167],
      zone: "Mahajanga",
      enqueteur: "ENQ-10",
      q_menage: "oui",
      q_eau: "reseau",
    },
  ];

  const ingestRes = await new GenericConnector().ingest({ source: src, rawItems }, ctx);
  assert.equal(ingestRes.insertedCount, 13);

  const agentRes = await runGuardianAgent(ctx, { sourceId: src.id, trigger: "submission" });
  const anomalies = journalRepo.listAnomalies(ctx, { runId: agentRes.run.id });

  // Vérifie les 4 familles d'erreurs MEAL attendues
  assert.ok(anomalies.some((a) => a.category === "exact_duplicate"));
  assert.ok(anomalies.some((a) => a.category === "outlier" && a.field === "age"));
  assert.ok(anomalies.some((a) => a.category === "geo_out_of_bounds"));
  const copyPaste = anomalies.filter((a) => a.category === "enumerator_copy_paste");
  assert.equal(copyPaste.length, 2, "M-06 et M-07 doivent être signalés pour copier-coller d'ENQ-04");

  // Vérifie le journal agent_actions + notification + réversibilité
  const actions = journalRepo.listAgentActions(ctx, agentRes.run.id);
  assert.ok(actions.some((a) => a.toolName === "notify_run_summary"));
  const reversibleAction = actions.find((a) => a.reversible);
  assert.ok(reversibleAction);

  rollbackAgentAction(ctx, reversibleAction.id);
  const afterRollback = journalRepo.listAgentActions(ctx, agentRes.run.id);
  assert.ok(afterRollback.some((a) => a.toolName === "rollback_action"));

  console.log(
    `[backend/tests/meal_autonomous.test.ts] MEAL autonome validé : ${anomalies.length} anomalies (dont ${copyPaste.length} copier-coller enquêteur), ${actions.length} actions journalisées.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
