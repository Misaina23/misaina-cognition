export type ClearanceLevel = "C1" | "C2" | "C3" | "C4";

export interface UserRecord {
  id: string;
  email: string;
  fullName: string;
  password: string;
  role: "ADMIN" | "MANAGER" | "EMPLOYEE" | "GUEST";
  department: string;
  missionTheater?: string;
  clearanceLevel: ClearanceLevel;
  emailConfirmed: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  pageNumber: number;
  chunkIndex: number;
  content: string;
  excerpt: string;
}

export interface DocumentRecord {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  size: number;
  uploadedBy: string;
  uploadedById: string;
  department: string;
  classification: ClearanceLevel;
  theater: string;
  version: number;
  status: "INDEXED" | "PROCESSING" | "PENDING";
  category?: string;
  tags?: string;
  summary?: string;
  chunks: DocumentChunk[];
  createdAt: string;
}

export interface SourceDto {
  documentTitle: string;
  pageNumber?: number;
  excerpt?: string;
  classification?: ClearanceLevel;
  theater?: string;
  bm25Score?: number;
  vectorScore?: number;
  rrfScore?: number;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  tokenMasked: string;
  scope: "READ_ONLY" | "READ_WRITE" | "AUDIT_ONLY";
  department: string;
  createdAt: string;
  lastUsedAt?: string;
  status: "ACTIVE" | "REVOKED";
  rateLimitPerMin: number;
}

export interface DocumentDiffRecord {
  id: string;
  documentTitle: string;
  previousVersion: string;
  currentVersion: string;
  date: string;
  department: string;
  changesSummary: string;
  diffItems: {
    section: string;
    type: "MODIFIED" | "ADDED" | "DELETED";
    previousText?: string;
    currentText?: string;
    impact: "MAJEUR" | "MINEUR" | "CONFORMITE";
  }[];
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  confidence?: number;
  sources?: SourceDto[];
  createdAt: string;
}

export interface ConversationRecord {
  id: string;
  userId: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedDocRecord {
  id: string;
  userId: string;
  question: string;
  answer: string;
  sources: SourceDto[];
  fileName: string;
  size: number;
  content: string;
  createdAt: string;
}

export interface AuditRecord {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userEmail: string;
  department: string;
  missionTheater?: string;
  action: "SEARCH_QUERY" | "DOC_UPLOAD" | "DOC_DOWNLOAD" | "SYNTHESIS_EXPORT" | "CONNECTOR_SYNC" | "BACKUP_EXPORT" | "BACKUP_IMPORT";
  queryOrTarget: string;
  dlpStatus: "CONFORME" | "PII_MASQUE" | "RESTREINT";
  dlpDetails?: string;
  sourcesCount: number;
  latencyMs: number;
  hashSignature: string;
}

export interface ConnectorRecord {
  id: string;
  name: string;
  type: "sharepoint" | "google_drive" | "sap" | "confluence" | "servicenow" | "salesforce" | "snowflake";
  status: "ACTIVE" | "SYNCING" | "IDLE" | "ERROR";
  documentsIndexed: number;
  frequency: "TEMPS_REEL" | "HORAIRE" | "QUOTIDIEN";
  lastSync: string;
  health: number;
  departmentAccess: string[];
}

// In-memory persistent database across requests
class MockDatabase {
  auditLogs: AuditRecord[] = [
    {
      id: "aud-001",
      timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      userId: "u-1",
      userName: "Dr. Arthur Vance (Directeur Général)",
      userEmail: "dir.exec@misaina-corp.org",
      department: "Direction Exécutive & Conseil",
      missionTheater: "Siège Global - Genève / Paris",
      action: "SEARCH_QUERY",
      queryOrTarget: "Standards minimaux d'approvisionnement en eau potable (Projet Sphère)",
      dlpStatus: "CONFORME",
      sourcesCount: 2,
      latencyMs: 380,
      hashSignature: "sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
    {
      id: "aud-002",
      timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      userId: "u-3",
      userName: "Aminata Traoré (Coordinatrice Opérations)",
      userEmail: "a.traore@misaina-corp.org",
      department: "Opérations Terrain & Urgence",
      missionTheater: "Bureau Régional Sahel - Dakar",
      action: "SEARCH_QUERY",
      queryOrTarget: "Procédure d'évacuation d'urgence et seuils d'alerte Orange/Rouge",
      dlpStatus: "CONFORME",
      sourcesCount: 2,
      latencyMs: 410,
      hashSignature: "sha256-4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a",
    },
    {
      id: "aud-003",
      timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      userId: "u-2",
      userName: "Hélène de Saint-Germain (Chief Information Security Officer)",
      userEmail: "ciso@misaina-corp.org",
      department: "Sécurité & Conformité Numérique",
      missionTheater: "Siège Global - Genève / Paris",
      action: "SYNTHESIS_EXPORT",
      queryOrTarget: "Rapport d'audit de conformité ISO/IEC 27001:2022 et chiffrement AES-256",
      dlpStatus: "CONFORME",
      sourcesCount: 3,
      latencyMs: 620,
      hashSignature: "sha256-ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d",
    },
    {
      id: "aud-004",
      timestamp: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
      userId: "u-4",
      userName: "Marc Lefebvre (Responsable Logistique & Achats)",
      userEmail: "m.lefebvre@misaina-corp.org",
      department: "Finance & Bailleurs Internationaux",
      missionTheater: "Hub Opérationnel d'Urgence - Goma",
      action: "SEARCH_QUERY",
      queryOrTarget: "Seuils d'appels d'offres bailleurs USAID et ECHO 50k USD",
      dlpStatus: "CONFORME",
      sourcesCount: 2,
      latencyMs: 490,
      hashSignature: "sha256-78e731027d8fd50ed642340b7c9a63b3eaedd3f2ccab3eccecf93064293f0190",
    },
  ];

  connectors: ConnectorRecord[] = [
    {
      id: "conn-1",
      name: "Microsoft 365 / SharePoint Online Institutionnel",
      type: "sharepoint",
      status: "ACTIVE",
      documentsIndexed: 4520,
      frequency: "TEMPS_REEL",
      lastSync: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      health: 99.9,
      departmentAccess: ["Tous", "Direction Exécutive & Conseil", "Opérations Terrain & Urgence"],
    },
    {
      id: "conn-2",
      name: "Google Workspace Enterprise & Drives Régionaux",
      type: "google_drive",
      status: "ACTIVE",
      documentsIndexed: 2850,
      frequency: "HORAIRE",
      lastSync: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
      health: 99.8,
      departmentAccess: ["Opérations Terrain & Urgence", "Sécurité & Conformité Numérique"],
    },
    {
      id: "conn-3",
      name: "Atlassian Confluence & Documentation Normative",
      type: "confluence",
      status: "ACTIVE",
      documentsIndexed: 1980,
      frequency: "TEMPS_REEL",
      lastSync: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
      health: 100,
      departmentAccess: ["Sécurité & Conformité Numérique", "Finance & Bailleurs Internationaux"],
    },
    {
      id: "conn-4",
      name: "SAP S/4HANA ERP Bailleurs & Comptabilité Internationale",
      type: "sap",
      status: "ACTIVE",
      documentsIndexed: 1240,
      frequency: "QUOTIDIEN",
      lastSync: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
      health: 99.5,
      departmentAccess: ["Finance & Bailleurs Internationaux", "Direction Exécutive & Conseil"],
    },
    {
      id: "conn-5",
      name: "ServiceNow GRC & Gestion des Incidents PSSI",
      type: "servicenow",
      status: "ACTIVE",
      documentsIndexed: 890,
      frequency: "HORAIRE",
      lastSync: new Date(Date.now() - 1000 * 60 * 75).toISOString(),
      health: 99.7,
      departmentAccess: ["Sécurité & Conformité Numérique"],
    },
    {
      id: "conn-6",
      name: "Snowflake Data Lakehouse / Données d'Impact Humanitaire",
      type: "snowflake",
      status: "ACTIVE",
      documentsIndexed: 3410,
      frequency: "TEMPS_REEL",
      lastSync: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
      health: 99.9,
      departmentAccess: ["Direction Exécutive & Conseil", "Opérations Terrain & Urgence"],
    },
  ];

  users: UserRecord[] = [
    {
      id: "u-1",
      email: "dir.exec@misaina-corp.org",
      fullName: "Dr. Arthur Vance",
      password: "password123",
      role: "ADMIN",
      department: "Direction Exécutive & Conseil",
      missionTheater: "Siège Global - Genève / Paris",
      clearanceLevel: "C4",
      emailConfirmed: true,
      isActive: true,
      createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
    },
    {
      id: "u-2",
      email: "ciso@misaina-corp.org",
      fullName: "Hélène de Saint-Germain",
      password: "password123",
      role: "MANAGER",
      department: "Sécurité & Conformité Numérique",
      missionTheater: "Siège Global - Genève / Paris",
      clearanceLevel: "C4",
      emailConfirmed: true,
      isActive: true,
      createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
    },
    {
      id: "u-3",
      email: "a.traore@misaina-corp.org",
      fullName: "Aminata Traoré",
      password: "password123",
      role: "MANAGER",
      department: "Opérations Terrain & Urgence",
      missionTheater: "Bureau Régional Sahel - Dakar",
      clearanceLevel: "C3",
      emailConfirmed: true,
      isActive: true,
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    },
    {
      id: "u-4",
      email: "m.lefebvre@misaina-corp.org",
      fullName: "Marc Lefebvre",
      password: "password123",
      role: "EMPLOYEE",
      department: "Finance & Bailleurs Internationaux",
      missionTheater: "Hub Opérationnel d'Urgence - Goma",
      clearanceLevel: "C2",
      emailConfirmed: true,
      isActive: true,
      createdAt: new Date(Date.now() - 15 * 86400000).toISOString(),
    },
  ];

  documents: DocumentRecord[] = [
    {
      id: "doc-sphere-2024",
      title: "Charte Humanitaire du Projet Sphère & Standards Minimaux 2024",
      fileName: "sphere_handbook_standards_humanitaires_2024.pdf",
      fileType: "application/pdf",
      size: 4850200,
      uploadedBy: "Dr. Arthur Vance",
      uploadedById: "u-1",
      department: "Opérations Terrain & Urgence",
      classification: "C1",
      theater: "Tous",
      version: 4,
      status: "INDEXED",
      category: "Normes Internationales",
      tags: "sphere, eau, wash, assainissement, abris, nutrition, santé d'urgence, dignité humaine",
      summary: "Cadre universel d'intervention humanitaire : droit de vivre dans la dignité, normes WASH (15 litres d'eau/personne/jour), critères d'abris (3,5 m² couverts/personne) et prise en charge nutritionnelle.",
      chunks: [
        {
          id: "chk-sph-1",
          documentId: "doc-sphere-2024",
          pageNumber: 14,
          chunkIndex: 0,
          content: "Principe Fondamental du Projet Sphère : Toute personne touchée par une catastrophe ou un conflit armé a le droit de recevoir une assistance humanitaire impartiale et de vivre dans la dignité. Les acteurs humanitaires ont le devoir moral et opérationnel de garantir l'accès universel aux biens de survie sans distinction d'origine, de race ou d'appartenance politique.",
          excerpt: "Droit inaliénable à l'assistance humanitaire impartiale et protection de la dignité humaine.",
        },
        {
          id: "chk-sph-2",
          documentId: "doc-sphere-2024",
          pageNumber: 82,
          chunkIndex: 1,
          content: "Standard WASH 1 (Eau Potable d'Urgence) : Chaque individu doit disposer d'un minimum absolu de 15 litres d'eau potable par jour pour la boisson, la préparation des repas et l'hygiène personnelle de base. La distance maximale entre un abri et le point de distribution d'eau ne doit pas excéder 500 mètres. Les points d'eau doivent afficher un chlore résiduel libre d'au moins 0,5 mg/l après 30 minutes de contact.",
          excerpt: "Norme minimale WASH : 15L d'eau par jour et par personne, distance maximale au point d'eau de 500m.",
        },
        {
          id: "chk-sph-3",
          documentId: "doc-sphere-2024",
          pageNumber: 145,
          chunkIndex: 2,
          content: "Standard Abris et Établissements Humains : Chaque personne hébergée dans un camp de déplacés ou de réfugiés doit bénéficier d'un espace de vie couvert d'au moins 3,5 mètres carrés, hors espace de stockage et installations sanitaires. La hauteur sous plafond minimale doit atteindre 2 mètres pour assurer une ventilation naturelle et limiter la prolifération des infections respiratoires aiguës.",
          excerpt: "Norme Abris d'urgence : surface minimale de 3,5 m² d'espace couvert par individu.",
        },
      ],
      createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    },
    {
      id: "doc-iso-27001",
      title: "Système de Management de la Sécurité de l'Information (SMSI ISO/IEC 27001:2022 & PSSI)",
      fileName: "smsi_iso27001_pssi_internationale.pdf",
      fileType: "application/pdf",
      size: 3420000,
      uploadedBy: "Hélène de Saint-Germain",
      uploadedById: "u-2",
      department: "Sécurité & Conformité Numérique",
      classification: "C4",
      theater: "Tous",
      version: 5,
      status: "INDEXED",
      category: "Sécurité & Conformité",
      tags: "iso27001, pssi, zero trust, mfa, aes256, hsm, fido2, dlp, chiffrement",
      summary: "Spécification formelle du SMSI certifié ISO/IEC 27001:2022 : architecture Zero-Trust, gestion des clés cryptographiques HSM, chiffrement de bout en bout AES-256-GCM et contrôles PSSI C1 à C4.",
      chunks: [
        {
          id: "chk-iso-1",
          documentId: "doc-iso-27001",
          pageNumber: 9,
          chunkIndex: 0,
          content: "Politique de Contrôle d'Accès et Architecture Zero Trust (Contrôle A.5.15) : L'accès aux systèmes d'information critiques repose sur le principe du moindre privilège. L'authentification multi-facteurs (MFA) via jeton physique résistant au phishing (clé de sécurité FIDO2 ou WebAuthn) est strictement obligatoire pour l'ensemble des administrateurs et des utilisateurs manipulant des données C3 et C4. Les mots de passe maître doivent contenir au minimum 16 caractères avec complexité stricte.",
          excerpt: "Obligation du MFA physique FIDO2/WebAuthn et principe du moindre privilège Zero Trust.",
        },
        {
          id: "chk-iso-2",
          documentId: "doc-iso-27001",
          pageNumber: 27,
          chunkIndex: 1,
          content: "Chiffrement et Protection Cryptographique (Contrôle A.8.24) : Toutes les données au repos sont chiffrées à l'aide de l'algorithme AES-256-GCM. Les clés de chiffrement de volume et de tables sont générées et séquestrées dans des modules matériels de sécurité (HSM certifiés FIPS 140-3 Niveau 3). Tout flux réseau transfrontalier est encapsulé dans des tunnels TLS 1.3 avec Perfect Forward Secrecy (PFS) ou WireGuard/IPsec chiffré.",
          excerpt: "Chiffrement AES-256-GCM au repos, HSM FIPS 140-3 et tunnels TLS 1.3/WireGuard en transit.",
        },
        {
          id: "chk-iso-3",
          documentId: "doc-iso-27001",
          pageNumber: 44,
          chunkIndex: 2,
          content: "Gestion des Incidents de Sécurité et Notification 72h (Contrôles A.5.24 à A.5.28) : Tout événement suspect, fuite présumée de données ou violation de périmètre doit être qualifié par le SOC sous un délai maximal de 2 heures. En cas de brèche confirmée sur des données sensibles, la notification formelle aux autorités de régulation (CNIL/EDPB) et aux partenaires institutionnels doit être instruite dans les 72 heures légales.",
          excerpt: "Qualification d'incident sous 2h par le SOC et notification réglementaire sous 72h.",
        },
      ],
      createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    },
    {
      id: "doc-sop-security",
      title: "Procédure Opérationnelle Standard (SOP) : Sécurité Terrain & Évacuation d'Urgence",
      fileName: "sop_sec_09_gestion_crise_evacuation.docx",
      fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 1980000,
      uploadedBy: "Aminata Traoré",
      uploadedById: "u-3",
      department: "Opérations Terrain & Urgence",
      classification: "C4",
      theater: "Hub Opérationnel d'Urgence - Goma",
      version: 3,
      status: "INDEXED",
      category: "Sécurité Terrain",
      tags: "sop, sécurité terrain, évacuation, safe room, convoi, radio vhf, couvre-feu, goma, kyiv, dakar",
      summary: "Directives tactiques de protection du personnel humanitaire en zone de conflit ou de haute instabilité : 4 niveaux d'alerte, gestion des mouvements de convois et plan d'évacuation d'urgence (Medevac/Secuevac).",
      chunks: [
        {
          id: "chk-sop-1",
          documentId: "doc-sop-security",
          pageNumber: 4,
          chunkIndex: 0,
          content: "Matrice des Niveaux d'Alerte Opérationnelle : \n- NIVEAU VERT (Normal) : Déplacements libres autorisés de 06h00 à 21h00 avec notification radio.\n- NIVEAU JAUNE (Vigilance accrue) : Couvre-feu nocturne fixé à 19h00, port du gilet d'identification obligatoire hors base.\n- NIVEAU ORANGE (Menace imminente) : Confinement de l'ensemble du personnel sur les bases durcies, suspension des activités de terrain non vitales.\n- NIVEAU ROUGE (Crise extrême / Hostilités directes) : Activation immédiate du plan d'évacuation d'urgence vers les zones de repli désignées ou vers l'aéroport international sous escorte sécurisée.",
          excerpt: "Matrice des 4 niveaux d'alerte de sécurité terrain : Vert, Jaune, Orange et Rouge (évacuation).",
        },
        {
          id: "chk-sop-2",
          documentId: "doc-sop-security",
          pageNumber: 12,
          chunkIndex: 1,
          content: "Règles Régissant les Convois Humanitaires : Tout mouvement de véhicule hors zone urbaine nécessite le dépôt d'un plan de route (Movement Authorization Form) validé par le Responsable Sécurité (FSO) 24 heures à l'avance. Chaque convoi comprend un minimum obligatoire de 2 véhicules 4x4 équipés de radios VHF Codan/Motorola et d'une balise de géolocalisation par satellite Garmin InReach active avec rapport de position automatique toutes les 15 minutes.",
          excerpt: "Protocole convoi : 2 véhicules 4x4 minimum, radio VHF, balise InReach et validation FSO 24h avant.",
        },
        {
          id: "chk-sop-3",
          documentId: "doc-sop-security",
          pageNumber: 19,
          chunkIndex: 2,
          content: "Sanctuaire d'Urgence (Safe Room) et Plan d'Extraction Aérienne : Chaque base opérationnelle dispose d'une Safe Room blindée munie de réserves autonomes de survie (eau, rations d'urgence MRE pour 72 heures, générateur de secours, téléphone satellite Iridium et trousse de traumatologie d'urgence). En cas de rupture des axes terrestres, l'extraction aérienne est déclenchée en coordination avec UNHAS / ECHO Flight.",
          excerpt: "Safe Room durcie avec autonomie de 72h (Iridium, MRE, eau) et coordination extraction UNHAS/ECHO.",
        },
      ],
      createdAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    },
    {
      id: "doc-donor-compliance",
      title: "Directives de Gestion Financière, Bailleurs Internationaux & Lutte Anti-Fraude",
      fileName: "directives_bailleurs_usaid_echo_antifraude.pdf",
      fileType: "application/pdf",
      size: 2750000,
      uploadedBy: "Marc Lefebvre",
      uploadedById: "u-4",
      department: "Finance & Bailleurs Internationaux",
      classification: "C2",
      theater: "Tous",
      version: 2,
      status: "INDEXED",
      category: "Conformité Financière",
      tags: "bailleurs, usaid, echo, fcdo, passation de marches, appels d'offres, seuils 50k, anti-fraude, audit",
      summary: "Règles d'éligibilité financière imposées par l'USAID, la DG ECHO et la Banque Mondiale : seuils de passation de marchés, mise en concurrence tripartite, politique de tolérance zéro fraude et conservation probatoire des pièces comptables.",
      chunks: [
        {
          id: "chk-don-1",
          documentId: "doc-donor-compliance",
          pageNumber: 8,
          chunkIndex: 0,
          content: "Seuils Réglementaires de Passation de Marchés : \n- Achats directs autorisés jusqu'à 3 000 USD (micro-achats de fonctionnement courant).\n- De 3 001 à 10 000 USD : Demande d'au moins 3 devis comparatifs écrits documentés.\n- De 10 001 à 50 000 USD : Procédure négociée avec mise en concurrence formalisée et comité d'évaluation des offres.\n- Au-delà de 50 000 USD : Appel d'offres public international obligatoire avec publication légale et validation préalable (No Objection) du bailleur institutionnel.",
          excerpt: "Grille des seuils d'achat : 3 devis obligatoires dès 3 001 USD et appel d'offres ouvert au-delà de 50 000 USD.",
        },
        {
          id: "chk-don-2",
          documentId: "doc-donor-compliance",
          pageNumber: 22,
          chunkIndex: 1,
          content: "Politique de Tolérance Zéro Fraude, Corruption et Financement Illicite : Tout collaborateur ou partenaire constatant un conflit d'intérêts, une surfacturation, une tentative de pot-de-vin ou un détournement de vivres doit exercer immédiatement le devoir d'alerte via le canal d'éthique chiffré indépendant (whistleblower). Toute infraction entraîne la suspension immédiate du contrat et le signalement aux organes d'enquête de l'OIG (Office of Inspector General - USAID) et de l'OLAF européen.",
          excerpt: "Tolérance zéro fraude/corruption, canal d'alerte protégé et saisine immédiate de l'OIG/OLAF.",
        },
      ],
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
    {
      id: "doc-gdpr-humanitarian",
      title: "Conformité RGPD & Transferts Transfrontaliers de Données d'Aide Humanitaire",
      fileName: "rgpd_edpb_protection_donnees_beneficiaires.pdf",
      fileType: "application/pdf",
      size: 2150000,
      uploadedBy: "Hélène de Saint-Germain",
      uploadedById: "u-2",
      department: "Sécurité & Conformité Numérique",
      classification: "C3",
      theater: "Tous",
      version: 2,
      status: "INDEXED",
      category: "Protection des Données",
      tags: "rgpd, edpb, cnil, donnees sensibles, cct, clauses contractuelles, biometrie, anonymisation",
      summary: "Cadre de gouvernance des données personnelles des bénéficiaires et du personnel : conformité aux lignes directrices du CEPD/EDPB, encadrement strict de la biométrie et Clauses Contractuelles Types (CCT).",
      chunks: [
        {
          id: "chk-gdp-1",
          documentId: "doc-gdpr-humanitarian",
          pageNumber: 6,
          chunkIndex: 0,
          content: "Protection des Données des Populations Vulnérables (Principe de Minimisation) : La collecte de données nominatives auprès des bénéficiaires d'aide d'urgence doit être strictement restreinte aux besoins de la distribution vitale. Le recueil d'identifiants biométriques (iris, empreintes digitales) requiert une analyse d'impact préalable (AIPD/DPIA) validée par le DPO. Les identifiants personnels doivent être pseudonymisés dès l'étape de consolidation en base centrale.",
          excerpt: "Minimisation stricte des données bénéficiaires, AIPD obligatoire avant toute collecte biométrique.",
        },
        {
          id: "chk-gdp-2",
          documentId: "doc-gdpr-humanitarian",
          pageNumber: 18,
          chunkIndex: 1,
          content: "Transferts Transfrontaliers Hors Espace Économique Européen : Tout transfert de bases de données de terrain vers des serveurs ou entités situées hors de l'Union Européenne s'effectue exclusivement sous le couvert des Clauses Contractuelles Types (CCT 2021/914) révisées de la Commission Européenne, complétées par des mesures techniques supplémentaires garantissant le chiffrement côté client sans possibilité d'interception tierce.",
          excerpt: "Encadrement des transferts hors UE par les Clauses Contractuelles Types (CCT) et chiffrement de bout en bout.",
        },
      ],
      createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    },
    {
      id: "doc-chs-psea",
      title: "Norme Humanitaire Fondamentale (CHS) & Politique de Prévention PSEA",
      fileName: "chs_core_humanitarian_standard_psea_protection.pdf",
      fileType: "application/pdf",
      size: 1650000,
      uploadedBy: "Aminata Traoré",
      uploadedById: "u-3",
      department: "Direction Exécutive & Conseil",
      classification: "C2",
      theater: "Tous",
      version: 3,
      status: "INDEXED",
      category: "Éthique & Redevabilité",
      tags: "chs, psea, harcelement, abus sexuels, redevabilite, gestion des plaintes, ethique",
      summary: "Les 9 engagements de la Norme Humanitaire Fondamentale de qualité et de redevabilité (CHS) et dispositions impératives relatives à la Prévention de l'Exploitation et des Abus Sexuels (PSEA).",
      chunks: [
        {
          id: "chk-chs-1",
          documentId: "doc-chs-psea",
          pageNumber: 11,
          chunkIndex: 0,
          content: "Engagement CHS sur la Redevabilité et la Gestion des Plaintes : L'organisation est tenue d'établir des mécanismes de plainte accessibles, confidentiels et adaptés aux contextes locaux pour les communautés affectées. Chaque signalement reçu doit être enregistré dans un registre sécurisé et faire l'objet d'un accusé de réception formel sous 5 jours ouvrés.",
          excerpt: "Mécanismes de plaintes locaux confidentiels et traitement garanti sous 5 jours ouvrés.",
        },
        {
          id: "chk-chs-2",
          documentId: "doc-chs-psea",
          pageNumber: 24,
          chunkIndex: 1,
          content: "Politique PSEA (Prévention de l'Exploitation et des Abus Sexuels) : L'échange de toute assistance humanitaire (vivres, eau, abris, soins ou numéraire) contre des faveurs de nature sexuelle constitue une faute lourde d'une gravité absolue entraînant le licenciement immédiat sans préavis et la transmission du dossier aux autorités judiciaires compétentes. Tous les employés et prestataires signent la clause d'engagement PSEA à leur embauche.",
          excerpt: "Tolérance zéro PSEA : toute sollicitation contre assistance humanitaire entraîne licenciement et poursuites pénales.",
        },
      ],
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
  ];

  conversations: ConversationRecord[] = [
    {
      id: "conv-default-1",
      userId: "u-1",
      title: "Standards WASH Projet Sphère et Abris d'Urgence",
      messages: [
        {
          id: "msg-init-1",
          conversationId: "conv-default-1",
          role: "user",
          content: "Quelles sont les normes minimales d'eau potable et de surface d'abri définies par le Projet Sphère pour une mission d'urgence ?",
          createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        },
        {
          id: "msg-init-2",
          conversationId: "conv-default-1",
          role: "assistant",
          content: `Selon les **Standards Minimaux du Projet Sphère 2024** :

### 1. Approvisionnement en Eau Potable (Standard WASH 1)
- **Volume minimal vital** : Au moins **15 litres d'eau potable par personne et par jour** pour couvrir l'ensemble des besoins de boisson, de préparation des aliments et d'hygiène personnelle de base.
- **Accessibilité physique** : La distance entre le point de distribution d'eau et le dernier abri ne doit pas dépasser **500 mètres**.
- **Qualité bactériologique** : Maintien obligatoire d'une teneur en chlore résiduel libre d'au moins **0,5 mg/l** après 30 minutes de contact pour prévenir toute contamination hydrique.

### 2. Abris et Espace Couvert d'Urgence
- **Surface privative minimale** : Chaque individu accueilli dans un camp ou centre d'hébergement temporaire doit disposer de **3,5 mètres carrés d'espace de vie couvert** (hors espaces sanitaires et stockage).
- **Hauteur sous plafond** : Un minimum de **2 mètres** est imposé pour garantir une aération suffisante et réduire les risques d'infections respiratoires.

*(Sources vérifiées : Charte Humanitaire du Projet Sphère, Page 82 & Page 145 - Classification C1 Public)*`,
          confidence: 0.98,
          sources: [
            {
              documentTitle: "Charte Humanitaire du Projet Sphère & Standards Minimaux 2024",
              pageNumber: 82,
              excerpt: "Norme minimale WASH : 15L d'eau par jour et par personne, distance maximale au point d'eau de 500m.",
              classification: "C1",
              theater: "Tous",
              bm25Score: 0.96,
              vectorScore: 0.98,
              rrfScore: 0.97,
            },
            {
              documentTitle: "Charte Humanitaire du Projet Sphère & Standards Minimaux 2024",
              pageNumber: 145,
              excerpt: "Norme Abris d'urgence : surface minimale de 3,5 m² d'espace couvert par individu.",
              classification: "C1",
              theater: "Tous",
              bm25Score: 0.92,
              vectorScore: 0.95,
              rrfScore: 0.935,
            },
          ],
          createdAt: new Date(Date.now() - 3600000 * 2 + 1500).toISOString(),
        },
      ],
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 2 + 1500).toISOString(),
    },
  ];

  apiKeys: ApiKeyRecord[] = [
    {
      id: "key-1",
      name: "Passerelle Sécurisée Microsoft Teams / Siège",
      prefix: "misaina_live_teams",
      tokenMasked: "misaina_live_teams_••••••••9a4e",
      scope: "READ_ONLY",
      department: "Direction Exécutive & Conseil",
      createdAt: new Date(Date.now() - 86400000 * 15).toISOString(),
      lastUsedAt: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
      status: "ACTIVE",
      rateLimitPerMin: 120,
    },
    {
      id: "key-2",
      name: "Connecteur ServiceNow GRC & Audit PSSI",
      prefix: "misaina_live_snow",
      tokenMasked: "misaina_live_snow_••••••••2c1f",
      scope: "READ_WRITE",
      department: "Sécurité & Conformité Numérique",
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      lastUsedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      status: "ACTIVE",
      rateLimitPerMin: 300,
    },
    {
      id: "key-3",
      name: "API Passerelle Logistique Terrain (Goma/Dakar)",
      prefix: "misaina_live_ops",
      tokenMasked: "misaina_live_ops_••••••••7d89",
      scope: "READ_ONLY",
      department: "Opérations Terrain & Urgence",
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      lastUsedAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
      status: "ACTIVE",
      rateLimitPerMin: 500,
    },
  ];

  documentDiffs: DocumentDiffRecord[] = [
    {
      id: "diff-1",
      documentTitle: "SOP Sécurité Terrain & Évacuation d'Urgence",
      previousVersion: "v2.4 (2025)",
      currentVersion: "v3.0 (2026)",
      date: "2026-02-10",
      department: "Opérations Terrain & Urgence",
      changesSummary: "Intégration du protocole d'extraction aérienne d'urgence via UNHAS, réduction de l'intervalle de ping des balises par satellite Garmin InReach de 30 min à 15 min, et obligation d'un minimum de 2 véhicules 4x4 tout terrain pour tout convoi humanitaire.",
      diffItems: [
        {
          section: "Article 3.2 - Protocole Convoi Humanitaire",
          type: "MODIFIED",
          previousText: "Déplacement autorisé en véhicule individuel avec notification radio toutes les heures.",
          currentText: "Convoi composé d'au moins deux véhicules 4x4 tout terrain équipés de radios VHF Codan/Motorola et balise Garmin InReach active toutes les 15 minutes.",
          impact: "MAJEUR",
        },
        {
          section: "Article 7.1 - Autonomie Safe Room",
          type: "MODIFIED",
          previousText: "Réserves d'eau et de nourriture d'urgence dimensionnées pour 48 heures.",
          currentText: "Réserves autonomes de survie (eau, rations MRE, téléphone Iridium) portées à 72 heures certifiées.",
          impact: "CONFORMITE",
        },
        {
          section: "Article 9.4 - Extraction UNHAS / ECHO Flight",
          type: "ADDED",
          previousText: undefined,
          currentText: "En cas de blocus ou de rupture des axes terrestres, l'extraction aéroportée est formellement requise sous coordination exclusive du Field Security Officer.",
          impact: "MAJEUR",
        },
      ],
    },
    {
      id: "diff-2",
      documentTitle: "Directives de Gestion Financière & Bailleurs (USAID / ECHO)",
      previousVersion: "v1.8 (2024)",
      currentVersion: "v2.0 (2026)",
      date: "2026-01-20",
      department: "Finance & Bailleurs Internationaux",
      changesSummary: "Harmonisation des seuils de mise en concurrence écrite dès 3 000 USD, intégration du canal de signalement indépendant Whistleblower OIG/OLAF et obligation de double validation électronique pour tout virement bancaire supérieur à 10 000 USD.",
      diffItems: [
        {
          section: "Section 2.1 - Seuils de Passation des Marchés",
          type: "MODIFIED",
          previousText: "Achats directs autorisés jusqu'à 5 000 USD sans devis préalable écrit.",
          currentText: "Mise en concurrence écrite obligatoire dès 3 000 USD avec conservation probatoire d'au moins 3 devis comparatifs.",
          impact: "MAJEUR",
        },
        {
          section: "Section 4.3 - Signalement Anti-Fraude & Lanceurs d'Alerte",
          type: "ADDED",
          previousText: undefined,
          currentText: "Déploiement d'une plateforme de signalement cryptée garantissant l'anonymat absolu du déclarant et protection juridique contre toute mesure de représailles.",
          impact: "CONFORMITE",
        },
      ],
    },
  ];

  feedbacks: { id: string; query: string; rating: "positive" | "negative"; comment?: string; certified?: boolean; timestamp: string }[] = [];
  generatedDocs: GeneratedDocRecord[] = [];
  resetTokens: Map<string, string> = new Map();
  subscribers: Set<(data: string) => void> = new Set();

  broadcastEvent(event: { type: string; documentId?: string; percent?: number; message?: string }) {
    const payload = JSON.stringify(event);
    for (const sub of this.subscribers) {
      try {
        sub(payload);
      } catch {
        // ignore closed subscriber
      }
    }
  }

  findUserByEmail(email: string) {
    return this.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  findUserById(id: string) {
    return this.users.find((u) => u.id === id);
  }

  createUser(data: { email: string; fullName: string; password?: string; role?: string; department?: string; missionTheater?: string; clearanceLevel?: ClearanceLevel }) {
    const newUser: UserRecord = {
      id: `u-${Date.now()}`,
      email: data.email,
      fullName: data.fullName,
      password: data.password || "password123",
      role: (data.role?.toUpperCase() as any) || "EMPLOYEE",
      department: data.department || "Direction Exécutive & Conseil",
      missionTheater: data.missionTheater || "Siège Global - Genève / Paris",
      clearanceLevel: data.clearanceLevel || "C2",
      emailConfirmed: true,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    this.users.push(newUser);
    return newUser;
  }

  // Hybrid search across indexed document chunks with ResourceGuard clearance and theater filtering
  searchChunks(
    query: string,
    limit = 4,
    userClearance: ClearanceLevel = "C4",
    filterTheater: string = "TOUS"
  ): { chunk: DocumentChunk; doc: DocumentRecord; score: number; bm25Score: number; vectorScore: number; rrfScore: number }[] {
    const RANK_MAP: Record<ClearanceLevel, number> = { C1: 1, C2: 2, C3: 3, C4: 4 };
    const userRank = RANK_MAP[userClearance] || 2;

    const rawTokens = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 2);
    const results: { chunk: DocumentChunk; doc: DocumentRecord; score: number; bm25Score: number; vectorScore: number; rrfScore: number }[] = [];

    for (const doc of this.documents) {
      // ResourceGuard: Enforce clearance check
      const docRank = RANK_MAP[doc.classification] || 2;
      if (docRank > userRank) {
        continue; // strictly filtered out
      }

      // Theater filtering if set and not "TOUS"
      if (filterTheater !== "TOUS" && doc.theater !== "Tous" && !doc.theater.toLowerCase().includes(filterTheater.toLowerCase())) {
        continue;
      }

      for (const chunk of doc.chunks) {
        let lexicalHits = 0;
        const text = (chunk.content + " " + (doc.tags || "") + " " + doc.title + " " + (doc.category || "")).toLowerCase();

        for (const token of rawTokens) {
          if (text.includes(token)) lexicalHits += 1;
        }

        if (lexicalHits > 0) {
          const bm25 = Math.min(1.0, 0.40 + lexicalHits * 0.18);
          const vector = Math.min(0.99, 0.85 + Math.random() * 0.12);
          const rrf = Number(((bm25 * 0.5) + (vector * 0.5)).toFixed(3));
          results.push({ chunk, doc, score: rrf, bm25Score: Number(bm25.toFixed(2)), vectorScore: Number(vector.toFixed(2)), rrfScore: rrf });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}

// Global singleton
const globalForDb = globalThis as unknown as { mockDb?: MockDatabase };
export const mockDb = globalForDb.mockDb ?? new MockDatabase();
if (process.env.NODE_ENV !== "production") globalForDb.mockDb = mockDb;
