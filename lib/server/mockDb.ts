export interface UserRecord {
  id: string;
  email: string;
  fullName: string;
  password: string;
  role: "ADMIN" | "MANAGER" | "EMPLOYEE" | "GUEST";
  department: string;
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

// In-memory persistent database across requests
class MockDatabase {
  users: UserRecord[] = [
    {
      id: "u-1",
      email: "admin@misaina.internal",
      fullName: "Administrateur Misaina",
      password: "password123",
      role: "ADMIN",
      department: "Direction Générale",
      emailConfirmed: true,
      isActive: true,
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    },
    {
      id: "u-2",
      email: "marie.curie@misaina.internal",
      fullName: "Marie Curie",
      password: "password123",
      role: "MANAGER",
      department: "R&D & Intelligence Artificielle",
      emailConfirmed: true,
      isActive: true,
      createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    },
    {
      id: "u-3",
      email: "jean.dupont@misaina.internal",
      fullName: "Jean Dupont",
      password: "password123",
      role: "EMPLOYEE",
      department: "Ressources Humaines",
      emailConfirmed: true,
      isActive: true,
      createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    },
    {
      id: "u-4",
      email: "sophie.martin@misaina.internal",
      fullName: "Sophie Martin",
      password: "password123",
      role: "MANAGER",
      department: "Sécurité des Systèmes d'Information",
      emailConfirmed: true,
      isActive: true,
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
  ];

  documents: DocumentRecord[] = [
    {
      id: "doc-1",
      title: "Guide RH & Avantages Sociaux 2026",
      fileName: "guide_rh_avantages_2026.pdf",
      fileType: "application/pdf",
      size: 1420500,
      uploadedBy: "Jean Dupont",
      uploadedById: "u-3",
      department: "Ressources Humaines",
      version: 2,
      status: "INDEXED",
      category: "RH",
      tags: "avantages, congés, mutuelle, rtt, prévoyance",
      summary: "Synthèse des droits sociaux, forfaits jours, mutuelle d'entreprise (prise en charge à 80%) et jours de RTT annuels.",
      chunks: [
        {
          id: "chk-1-1",
          documentId: "doc-1",
          pageNumber: 3,
          chunkIndex: 0,
          content: "Congés payés et RTT : Chaque salarié acquiert 2.08 jours ouvrés de congés par mois. Pour le personnel au forfait jours, 11 jours de RTT sont alloués annuellement au titre de 2026. La pose de congés s'effectue via l'intranet RH au moins 15 jours à l'avance.",
          excerpt: "Chaque salarié acquiert 2.08 jours de CP/mois et 11 jours de RTT annuels pour le forfait jours.",
        },
        {
          id: "chk-1-2",
          documentId: "doc-1",
          pageNumber: 8,
          chunkIndex: 1,
          content: "Couverture Santé & Mutuelle : Misaina prend en charge à hauteur de 80% la cotisation de base de la mutuelle d'entreprise (formule famille ou individuelle). Les remboursements optique et dentaire bénéficient du panier 100% Santé sans reste à charge.",
          excerpt: "Prise en charge employeur à 80% de la mutuelle d'entreprise pour tous les collaborateurs.",
        },
      ],
      createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    },
    {
      id: "doc-2",
      title: "Charte du Télétravail & Flexibilité",
      fileName: "charte_teletravail_misaina.docx",
      fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 480200,
      uploadedBy: "Jean Dupont",
      uploadedById: "u-3",
      department: "Ressources Humaines",
      version: 1,
      status: "INDEXED",
      category: "Organisation",
      tags: "remote, télétravail, horaires, matériel, indemnité",
      summary: "Règles d'éligibilité au travail à distance, aménagement du poste de travail et versement de l'indemnité forfaitaire journalière.",
      chunks: [
        {
          id: "chk-2-1",
          documentId: "doc-2",
          pageNumber: 2,
          chunkIndex: 0,
          content: "Rythme de télétravail : Les collaborateurs ayant validé leur période d'essai peuvent exercer leurs fonctions à distance jusqu'à 2 à 3 jours par semaine. Les mardis et jeudis sont préférentiellement conservés pour les réunions d'équipe sur site.",
          excerpt: "Télétravail autorisé jusqu'à 3 jours hebdomadaires après période d'essai, mardis/jeudis sur site.",
        },
        {
          id: "chk-2-2",
          documentId: "doc-2",
          pageNumber: 4,
          chunkIndex: 1,
          content: "Indemnités et matériel : Une indemnité forfaitaire de 2,50 € par jour télétravaillé est versée sur fiche de paie. L'entreprise fournit un PC portable, deux écrans 27 pouces et une contribution de 150 € pour l'achat d'un siège ergonomique.",
          excerpt: "Indemnité de 2,50 € / jour de télétravail et pack matériel complet fourni par le service IT.",
        },
      ],
      createdAt: new Date(Date.now() - 6 * 86400000).toISOString(),
    },
    {
      id: "doc-3",
      title: "Architecture & Sécurité Misaina Cognition",
      fileName: "architecture_securite_v3.pdf",
      fileType: "application/pdf",
      size: 3210400,
      uploadedBy: "Marie Curie",
      uploadedById: "u-2",
      department: "R&D",
      version: 3,
      status: "INDEXED",
      category: "Technique",
      tags: "rag, embeddings, chiffrement, pgvector, hybrid search",
      summary: "Spécifications techniques du moteur d'IA générative d'entreprise, recherche hybride BM25 + vecteurs et isolation multitenant.",
      chunks: [
        {
          id: "chk-3-1",
          documentId: "doc-3",
          pageNumber: 5,
          chunkIndex: 0,
          content: "Pipeline RAG hybride : Les requêtes utilisateurs sont analysées en parallèle par l'algorithme BM25 (correspondances textuelles exactes) et par projection vectorielle (cosine similarity). Le score combiné Reciprocal Rank Fusion garantit une précision > 92%.",
          excerpt: "Pipeline de recherche hybride BM25 + Dense Vectors avec fusion par Reciprocal Rank Fusion.",
        },
        {
          id: "chk-3-2",
          documentId: "doc-3",
          pageNumber: 12,
          chunkIndex: 1,
          content: "Isolation & Confidentialité : Chaque document est associé à un département et un niveau d'habilitation (ResourceGuard). Les chunks non autorisés pour le rôle de l'utilisateur sont filtrés en base de données avant tout prompt LLM.",
          excerpt: "Filtrage strict RBAC en amont de l'inférence : les chunks non autorisés ne sont jamais injectés au LLM.",
        },
      ],
      createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    },
    {
      id: "doc-4",
      title: "Procédure d'Onboarding & Accueil Collaborateur",
      fileName: "procedure_onboarding.docx",
      fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 210000,
      uploadedBy: "Administrateur Misaina",
      uploadedById: "u-1",
      department: "Direction Générale",
      version: 1,
      status: "INDEXED",
      category: "Onboarding",
      tags: "intégration, parrainage, premier jour, livret",
      summary: "Feuille de route pour l'accueil des nouvelles recrues, attributions des accès et suivi des 30 premiers jours.",
      chunks: [
        {
          id: "chk-4-1",
          documentId: "doc-4",
          pageNumber: 2,
          chunkIndex: 0,
          content: "Premier jour d'accueil : 09h30 accueil café avec l'équipe RH et remise du Welcome Pack. 10h30 configuration du poste et remise des accès par l'IT. 12h30 déjeuner d'équipe pris en charge. 14h30 rencontre avec le parrain ou la marraine désignée.",
          excerpt: "Planning détaillé de la première journée d'intégration et attribution d'un parrain dédié.",
        },
      ],
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    {
      id: "doc-5",
      title: "Politique de Sécurité des Systèmes d'Information (PSSI)",
      fileName: "pssi_misaina_2026.pdf",
      fileType: "application/pdf",
      size: 1850000,
      uploadedBy: "Sophie Martin",
      uploadedById: "u-4",
      department: "Sécurité",
      version: 4,
      status: "INDEXED",
      category: "Conformité",
      tags: "mots de passe, mfa, iso27001, chiffrement, vpn",
      summary: "Règles d'or de cybersécurité, gestion des identifiants et règles de classification des données internes.",
      chunks: [
        {
          id: "chk-5-1",
          documentId: "doc-5",
          pageNumber: 7,
          chunkIndex: 0,
          content: "Politique de mots de passe : Tout compte requiert un mot de passe d'au moins 14 caractères combinant majuscules, minuscules, chiffres et caractères spéciaux. Le MFA (authentification multi-facteurs) via application TOTP ou clé FIDO2 est obligatoire.",
          excerpt: "Mots de passe d'au moins 14 caractères et authentification multifacteur (MFA) obligatoire.",
        },
        {
          id: "chk-5-2",
          documentId: "doc-5",
          pageNumber: 15,
          chunkIndex: 1,
          content: "Verrouillage et accès distant : Le verrouillage automatique des écrans après 5 minutes d'inactivité est imposé par GPO. Les connexions distantes nécessitent impérativement le VPN d'entreprise avec tunnel chiffré WireGuard/IPsec.",
          excerpt: "Verrouillage automatique après 5 minutes d'inactivité et tunnel VPN chiffré obligatoire.",
        },
      ],
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
  ];

  conversations: ConversationRecord[] = [
    {
      id: "conv-default-1",
      userId: "u-1",
      title: "Règles de télétravail et indemnités",
      messages: [
        {
          id: "msg-init-1",
          conversationId: "conv-default-1",
          role: "user",
          content: "Quel est le nombre de jours de télétravail autorisé et quelle est l'indemnité ?",
          createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        },
        {
          id: "msg-init-2",
          conversationId: "conv-default-1",
          role: "assistant",
          content: `D'après la **Charte du Télétravail & Flexibilité** :

- **Jours autorisés** : Jusqu'à **2 à 3 jours par semaine** pour tout collaborateur en CDI ayant validé sa période d'essai.
- **Présence recommandée** : Mardis et jeudis sur site pour préserver la cohésion d'équipe.
- **Indemnité journalière** : **2,50 € nets par jour de télétravail effectif**, versés directement sur votre fiche de paie.
- **Matériel** : PC portable professionnel, 2 écrans 27 pouces et une aide de 150 € pour votre assise ergonomique.`,
          confidence: 0.96,
          sources: [
            {
              documentTitle: "Charte du Télétravail & Flexibilité",
              pageNumber: 2,
              excerpt: "Télétravail autorisé jusqu'à 3 jours hebdomadaires après période d'essai, mardis/jeudis sur site.",
            },
            {
              documentTitle: "Charte du Télétravail & Flexibilité",
              pageNumber: 4,
              excerpt: "Indemnité de 2,50 € / jour de télétravail et pack matériel complet fourni par le service IT.",
            },
          ],
          createdAt: new Date(Date.now() - 3600000 * 2 + 1500).toISOString(),
        },
      ],
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 2 + 1500).toISOString(),
    },
  ];

  generatedDocs: GeneratedDocRecord[] = [];
  resetTokens: Map<string, string> = new Map();
  // Notification subscribers for SSE
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

  createUser(data: { email: string; fullName: string; password?: string; role?: string; department?: string }) {
    const newUser: UserRecord = {
      id: `u-${Date.now()}`,
      email: data.email,
      fullName: data.fullName,
      password: data.password || "password123",
      role: (data.role?.toUpperCase() as any) || "EMPLOYEE",
      department: data.department || "Direction Générale",
      emailConfirmed: true,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    this.users.push(newUser);
    return newUser;
  }

  // Hybrid search across all indexed document chunks
  searchChunks(query: string, limit = 4): { chunk: DocumentChunk; doc: DocumentRecord; score: number }[] {
    const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const results: { chunk: DocumentChunk; doc: DocumentRecord; score: number }[] = [];

    for (const doc of this.documents) {
      for (const chunk of doc.chunks) {
        let score = 0;
        const text = (chunk.content + " " + (doc.tags || "") + " " + doc.title).toLowerCase();

        for (const token of tokens) {
          if (text.includes(token)) score += 1;
        }

        if (score > 0) {
          results.push({ chunk, doc, score });
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
