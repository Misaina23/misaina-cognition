import fs from "node:fs";
import path from "node:path";

/**
 * Génère un jeu de données fictif déterministe de 150 lignes (130 saines + 20 erreurs injectées)
 * ainsi que le fichier `verite_terrain.json` décrivant chaque erreur attendue.
 */

interface GroundTruthError {
  externalId: string;
  rowNumber: number;
  errorType:
    | "exact_duplicate"
    | "near_duplicate"
    | "aberrant_age"
    | "missing_required"
    | "geo_out_of_bounds"
    | "geo_zone_mismatch";
  expectedCategory:
    | "exact_duplicate"
    | "near_duplicate"
    | "outlier"
    | "missing_required"
    | "geo_out_of_bounds";
  expectedRouting: "auto_action" | "human_validation";
  description: string;
}

const ZONES = [
  { name: "Dakar", lat: 14.7167, lon: -17.4677 },
  { name: "Thiès", lat: 14.791, lon: -16.9356 },
  { name: "Kaolack", lat: 14.1519, lon: -16.0726 },
  { name: "Saint-Louis", lat: 16.0179, lon: -16.4896 },
  { name: "Ziguinchor", lat: 12.5681, lon: -16.2719 },
];

const FIRST_NAMES = [
  "Aminata",
  "Moussa",
  "Fatou",
  "Ibrahima",
  "Mariama",
  "Oumar",
  "Kadiatou",
  "Cheikh",
  "Awa",
  "Mamadou",
  "Binta",
  "Abdoulaye",
  "Ndeye",
  "Modou",
  "Sokhna",
  "Babacar",
  "Rokhaya",
  "Lamine",
  "Khady",
  "Serigne",
];

const LAST_NAMES = [
  "Diallo",
  "Ndiaye",
  "Sow",
  "Ba",
  "Sy",
  "Fall",
  "Traoré",
  "Diop",
  "Cissé",
  "Gueye",
  "Faye",
  "Sarr",
  "Mbaye",
  "Thiam",
  "Camara",
  "Diagne",
  "Kouyaté",
  "Toure",
  "Seck",
  "Kane",
];

interface RowData {
  id: string;
  full_name: string;
  telephone: string;
  email: string;
  age: string;
  montant: string;
  date: string;
  lat: string;
  lon: string;
  zone: string;
}

function buildCleanRow(index: number): RowData {
  const fn = FIRST_NAMES[index % FIRST_NAMES.length];
  const ln = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
  const suffixCode = String(index + 1).padStart(3, "0");
  // Ajout d'un 2e prénom distinctif afin d'éviter toute collision phonétique ou trigramme entre lignes saines
  const middle = `M${suffixCode}`;
  const fullName = `${fn} ${middle} ${ln}`;

  const phoneSuffix = String(1000000 + index * 7919).slice(0, 7);
  const phone = `+22177${phoneSuffix}`;
  const email = `benef.${suffixCode}.${ln.toLowerCase()}@collecte-terrain.org`;
  const zoneObj = ZONES[index % ZONES.length];
  const jitterLat = ((index % 7) - 3) * 0.015;
  const jitterLon = ((index % 5) - 2) * 0.015;
  const age = 19 + (index % 52);
  const montant = 150 + (index % 15) * 45;
  const month = String(1 + (index % 10)).padStart(2, "0");
  const day = String(1 + (index % 26)).padStart(2, "0");

  return {
    id: `BEN-${suffixCode}`,
    full_name: fullName,
    telephone: phone,
    email,
    age: String(age),
    montant: String(montant),
    date: `2026-${month}-${day}`,
    lat: (zoneObj.lat + jitterLat).toFixed(4),
    lon: (zoneObj.lon + jitterLon).toFixed(4),
    zone: zoneObj.name,
  };
}

function main() {
  const rows: RowData[] = [];
  for (let i = 0; i < 130; i++) {
    rows.push(buildCleanRow(i));
  }

  const groundTruth: GroundTruthError[] = [];

  // 1) 4 doublons exacts (lignes 131 à 134, pointant vers des lignes saines 0..3)
  for (let k = 0; k < 4; k++) {
    const ref = rows[k];
    const id = `BEN-${131 + k}`;
    rows.push({
      ...ref,
      id,
      // Format téléphone alternatif normalisé vers la même clé métier
      telephone: ref.telephone.replace("+221", "00221"),
    });
    groundTruth.push({
      externalId: id,
      rowNumber: rows.length,
      errorType: "exact_duplicate",
      expectedCategory: "exact_duplicate",
      expectedRouting: "auto_action",
      description: `Doublon exact de ${ref.id} (${ref.full_name}) avec téléphone formaté différemment.`,
    });
  }

  // 2) 4 quasi-doublons ambigus (lignes 135 à 138 : faute de frappe + 1 chiffre diff. sur téléphone -> zone intermédiaire [0.80, 0.94))
  for (let k = 0; k < 4; k++) {
    const ref = rows[10 + k];
    const id = `BEN-${135 + k}`;
    const typoName = ref.full_name.replace(/[aeio]/g, (m, offset) => (offset < 8 ? "" : m));
    const lastDigit = ref.telephone.slice(-1);
    const altDigit = lastDigit === "9" ? "8" : "9";
    rows.push({
      ...ref,
      id,
      full_name: typoName,
      telephone: ref.telephone.slice(0, -1) + altDigit,
      email: `alt.${id.toLowerCase()}@collecte-terrain.org`,
    });
    groundTruth.push({
      externalId: id,
      rowNumber: rows.length,
      errorType: "near_duplicate",
      expectedCategory: "near_duplicate",
      expectedRouting: "human_validation",
      description: `Quasi-doublon ambigu de ${ref.id} (faute de frappe sur le nom + 1 chiffre différent sur le téléphone).`,
    });
  }

  // 3) 4 âges aberrants (lignes 139 à 142)
  const aberrantAges = [-5, 148, 212, 999];
  for (let k = 0; k < 4; k++) {
    const base = buildCleanRow(200 + k);
    const id = `BEN-${139 + k}`;
    rows.push({
      ...base,
      id,
      age: String(aberrantAges[k]),
    });
    groundTruth.push({
      externalId: id,
      rowNumber: rows.length,
      errorType: "aberrant_age",
      expectedCategory: "outlier",
      expectedRouting: "human_validation",
      description: `Âge aberrant injecté (${aberrantAges[k]} ans).`,
    });
  }

  // 4) 4 champs obligatoires vides (lignes 143 à 146)
  for (let k = 0; k < 4; k++) {
    const base = buildCleanRow(220 + k);
    const id = `BEN-${143 + k}`;
    const missingName = k < 2;
    rows.push({
      ...base,
      id,
      full_name: missingName ? "" : base.full_name,
      zone: missingName ? base.zone : "",
    });
    groundTruth.push({
      externalId: id,
      rowNumber: rows.length,
      errorType: "missing_required",
      expectedCategory: "missing_required",
      expectedRouting: "human_validation",
      description: missingName
        ? "Champ obligatoire fullName vide."
        : "Champ obligatoire zone vide.",
    });
  }

  // 5) 4 erreurs GPS / comparaison zone d'intervention (lignes 147 à 150)
  // 2 GPS hors pays + 2 coordonnées incohérentes avec la zone d'intervention déclarée
  const geoCases: Array<{
    lat: string;
    lon: string;
    zone: string;
    type: "geo_out_of_bounds" | "geo_zone_mismatch";
    desc: string;
  }> = [
    {
      lat: "48.8566",
      lon: "2.3522",
      zone: "Dakar",
      type: "geo_out_of_bounds",
      desc: "Coordonnées GPS à Paris (hors zone d'intervention globale).",
    },
    {
      lat: "0",
      lon: "0",
      zone: "Thiès",
      type: "geo_out_of_bounds",
      desc: "Coordonnées nulles (0, 0) invalides.",
    },
    {
      lat: "16.0179",
      lon: "-16.4896",
      zone: "Dakar",
      type: "geo_zone_mismatch",
      desc: "Coordonnées GPS à Saint-Louis alors que la zone d'intervention déclarée est Dakar.",
    },
    {
      lat: "14.1519",
      lon: "-16.0726",
      zone: "Ziguinchor",
      type: "geo_zone_mismatch",
      desc: "Coordonnées GPS à Kaolack alors que la zone d'intervention déclarée est Ziguinchor.",
    },
  ];

  for (let k = 0; k < 4; k++) {
    const base = buildCleanRow(240 + k);
    const id = `BEN-${147 + k}`;
    const gc = geoCases[k];
    rows.push({
      ...base,
      id,
      lat: gc.lat,
      lon: gc.lon,
      zone: gc.zone,
    });
    groundTruth.push({
      externalId: id,
      rowNumber: rows.length,
      errorType: gc.type,
      expectedCategory: "geo_out_of_bounds",
      expectedRouting: "human_validation",
      description: gc.desc,
    });
  }

  if (rows.length !== 150 || groundTruth.length !== 20) {
    throw new Error(`Attendu 150 lignes et 20 erreurs, obtenu ${rows.length} / ${groundTruth.length}`);
  }

  const outDirs = [
    path.join(process.cwd(), "scripts", "data"),
    path.join(process.cwd(), "tests", "fixtures"),
    path.join(process.cwd(), "backend", "tests", "fixtures"),
  ];

  const header = "id;full_name;telephone;email;age;montant;date;lat;lon;zone";
  const csvLines = [
    header,
    ...rows.map((r) =>
      [r.id, r.full_name, r.telephone, r.email, r.age, r.montant, r.date, r.lat, r.lon, r.zone].join(
        ";"
      )
    ),
  ];
  const csvContent = csvLines.join("\n");
  const truthContent = JSON.stringify(
    {
      totalRows: rows.length,
      totalErrors: groundTruth.length,
      errors: groundTruth,
    },
    null,
    2
  );

  for (const dir of outDirs) {
    fs.mkdirSync(dir, { recursive: true });
    const csvName = dir.endsWith("fixtures") ? "donnees_fictives.csv" : "dataset_150.csv";
    fs.writeFileSync(path.join(dir, csvName), csvContent, "utf8");
    fs.writeFileSync(path.join(dir, "verite_terrain.json"), truthContent, "utf8");
  }

  console.log(
    `[OK] Jeu de données généré : ${rows.length} lignes et ${groundTruth.length} erreurs dans scripts/data/ et tests/fixtures/.`
  );
}

main();
