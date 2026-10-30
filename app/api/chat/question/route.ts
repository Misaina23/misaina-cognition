import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/authHelper";
import { mockDb, SourceDto } from "@/lib/server/mockDb";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { question, conversationId } = body;

    if (!question || !question.trim()) {
      return NextResponse.json({ message: "Question requise" }, { status: 400 });
    }

    const user = getAuthUser(req) || mockDb.users[0];
    const convId = conversationId || `conv-${Date.now()}`;

    let conv = mockDb.conversations.find((c) => c.id === convId);
    if (!conv) {
      conv = {
        id: convId,
        userId: user.id,
        title: question.trim().slice(0, 48),
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockDb.conversations.unshift(conv);
    }

    // Add user message
    conv.messages.push({
      id: `msg-${Date.now()}-u`,
      conversationId: convId,
      role: "user",
      content: question,
      createdAt: new Date().toISOString(),
    });

    const qLower = question.toLowerCase();
    let answer = "";
    let sources: SourceDto[] = [];
    let confidence = 0.94;

    // Search existing chunks in database
    const matched = mockDb.searchChunks(question, 3);

    if (qLower.includes("télétravail") || qLower.includes("remote") || qLower.includes("hybride")) {
      answer = `D'après la **Charte du Télétravail & Flexibilité** :

- **Éligibilité** : Tout collaborateur en CDI ayant validé sa période d'essai peut bénéficier d'un rythme hybride allant jusqu'à **2 à 3 jours par semaine**.
- **Jours de présence commune** : Les mardis et jeudis sont réservés aux réunions d'équipe sur site afin de préserver l'émulation collective.
- **Indemnité forfaitaire** : Une allocation de **2,50 € nets par jour de télétravail effectif** est versée directement sur votre fiche de paie.
- **Équipement fourni** : PC portable professionnel, double écran externe 27" et une aide de 150 € pour l'aménagement ergonomique du poste à domicile.`;
      sources = [
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
      ];
      confidence = 0.96;
    } else if (qLower.includes("congé") || qLower.includes("rtt") || qLower.includes("mutuelle") || qLower.includes("santé") || qLower.includes("avantage")) {
      answer = `Selon le **Guide RH & Avantages Sociaux 2026** de Misaina :

- **Congés payés** : Acquisition de **2.08 jours ouvrés par mois** (soit 25 jours par an).
- **Forfait Jours & RTT** : **11 jours de RTT** sont alloués pour l'année 2026. La demande s'effectue via l'intranet au moins 15 jours à l'avance.
- **Mutuelle d'entreprise** : Prise en charge employeur à **80%** de la formule de base (individuelle ou familiale), incluant le panier 100% Santé sans reste à charge pour l'optique et le dentaire.
- **Titres-restaurant** : Valeur faciale de 10 € prise en charge à 60% par l'entreprise.`;
      sources = [
        {
          documentTitle: "Guide RH & Avantages Sociaux 2026",
          pageNumber: 3,
          excerpt: "Chaque salarié acquiert 2.08 jours de CP/mois et 11 jours de RTT annuels pour le forfait jours.",
        },
        {
          documentTitle: "Guide RH & Avantages Sociaux 2026",
          pageNumber: 8,
          excerpt: "Prise en charge employeur à 80% de la mutuelle d'entreprise pour tous les collaborateurs.",
        },
      ];
      confidence = 0.95;
    } else if (qLower.includes("onboarding") || qLower.includes("recrutement") || qLower.includes("arrivée") || qLower.includes("accueil")) {
      answer = `D'après la **Procédure d'Onboarding & Accueil Collaborateur** :

1. **Jour J (Accueil)** :
   - 09h30 : Accueil café RH, remise du badge et du livret de bienvenue.
   - 10h30 : Configuration du matériel informatique et attribution des accès sécurisés.
   - 12h30 : Déjeuner convivial d'équipe pris en charge par Misaina.
   - 14h30 : Présentation du tuteur/parrain d'intégration dédié.
2. **Semaine 1** : Entretiens immersifs avec les directeurs de pôles et formation pratique sur le moteur IA Misaina Cognition.
3. **Bilan d'étonnement** : Organisé à J+30 avec le manager et le service RH.`;
      sources = [
        {
          documentTitle: "Procédure d'Onboarding & Accueil Collaborateur",
          pageNumber: 2,
          excerpt: "Planning détaillé de la première journée d'intégration et attribution d'un parrain dédié.",
        },
      ];
      confidence = 0.94;
    } else if (qLower.includes("sécurité") || qLower.includes("mot de passe") || qLower.includes("mfa") || qLower.includes("pssi") || qLower.includes("vpn")) {
      answer = `Conformément à la **Politique de Sécurité des Systèmes d'Information (PSSI 2026)** :

- **Mots de passe** : Longueur minimale imposée de **14 caractères** avec complexité obligatoire (minuscules, majuscules, chiffres et symboles).
- **Double facteur (MFA)** : Obligatoire pour l'ensemble des postes et des accès cloud via application d'authentification ou clé FIDO2.
- **Verrouillage de poste** : Mise en veille sécurisée automatique après **5 minutes d'inactivité**.
- **Accès nomade** : Connexion systématique via le VPN chiffré WireGuard/IPsec certifié.`;
      sources = [
        {
          documentTitle: "Politique de Sécurité des Systèmes d'Information (PSSI)",
          pageNumber: 7,
          excerpt: "Mots de passe d'au moins 14 caractères et authentification multifacteur (MFA) obligatoire.",
        },
        {
          documentTitle: "Politique de Sécurité des Systèmes d'Information (PSSI)",
          pageNumber: 15,
          excerpt: "Verrouillage automatique après 5 minutes d'inactivité et tunnel VPN chiffré obligatoire.",
        },
      ];
      confidence = 0.97;
    } else if (qLower.includes("architecture") || qLower.includes("rag") || qLower.includes("moteur") || qLower.includes("vecteur")) {
      answer = `L'architecture de **Misaina Cognition** met en œuvre un pipeline RAG hybride de pointe :

- **Chunking sémantique** : Segmentation préservant la cohérence des paragraphes et métadonnées.
- **Recherche hybride** : Fusion par Reciprocal Rank Fusion combinant la recherche par mots-clés BM25 et la recherche vectorielle dense.
- **Gouvernance & RBAC** : Contrôle d'accès strict en amont (ResourceGuard). Aucun fragment de document non autorisé pour votre profil n'est transmis au LLM.
- **Traçabilité des citations** : Toute affirmation est accompagnée de sa source documentaire avec indication de page et extrait vérifiable.`;
      sources = [
        {
          documentTitle: "Architecture & Sécurité Misaina Cognition",
          pageNumber: 5,
          excerpt: "Pipeline de recherche hybride BM25 + Dense Vectors avec fusion par Reciprocal Rank Fusion.",
        },
        {
          documentTitle: "Architecture & Sécurité Misaina Cognition",
          pageNumber: 12,
          excerpt: "Filtrage strict RBAC en amont de l'inférence : les chunks non autorisés ne sont jamais injectés au LLM.",
        },
      ];
      confidence = 0.95;
    } else if (matched.length > 0) {
      // Dynamic synthesis from matched chunks in database
      const excerpts = matched.map((m) => m.chunk.content).join("\n\n");
      answer = `D'après l'analyse des documents indexés dans la base de connaissances Misaina Cognition :

${excerpts}

Pour approfondir ces points, vous pouvez consulter les documents complets référencés ci-dessous ou générer une fiche de synthèse au format Word.`;
      sources = matched.map((m) => ({
        documentTitle: m.doc.title,
        pageNumber: m.chunk.pageNumber,
        excerpt: m.chunk.excerpt,
      }));
      confidence = 0.91;
    } else {
      const topDoc = mockDb.documents[0];
      answer = `Concernant votre demande (« *${question}* »), les référentiels internes de l'entreprise fournissent des directives précises :

- Les processus et documents officiels sont centralisés dans le répertoire **${topDoc.department}**.
- Vous pouvez formuler une question plus spécifique sur les thématiques RH (télétravail, congés, mutuelle), la sécurité informatique (mots de passe, VPN, MFA) ou l'architecture technique de la plateforme.
- Pour une analyse personnalisée, vous pouvez téléverser votre propre document dans l'onglet Documents.`;
      sources = [
        {
          documentTitle: topDoc.title,
          pageNumber: 1,
          excerpt: topDoc.summary || topDoc.title,
        },
      ];
      confidence = 0.85;
    }

    conv.messages.push({
      id: `msg-${Date.now()}-a`,
      conversationId: convId,
      role: "assistant",
      content: answer,
      confidence,
      sources,
      createdAt: new Date().toISOString(),
    });

    conv.updatedAt = new Date().toISOString();

    return NextResponse.json({
      conversationId: convId,
      answer,
      sources,
      confidence,
    });
  } catch (error) {
    return NextResponse.json({ message: "Erreur lors du traitement de la question" }, { status: 500 });
  }
}
