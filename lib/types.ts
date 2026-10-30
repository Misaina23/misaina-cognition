export type ClearanceLevel = "C1" | "C2" | "C3" | "C4";

export interface Source {
  documentTitle: string;
  pageNumber?: number;
  excerpt?: string;
  classification?: ClearanceLevel;
  theater?: string;
  bm25Score?: number;
  vectorScore?: number;
  rrfScore?: number;
}

export interface ChatResponse {
  conversationId: string;
  answer: string;
  sources?: Source[];
  confidence?: number;
  dlpStatus?: "CONFORME" | "PII_MASQUE";
  modelUsed?: string;
  ragPipeline?: {
    latencyTotalMs: number;
    retrievalMs: number;
    rrfMs: number;
    inferenceMs: number;
    dlpMs: number;
  };
}

export interface DocumentDto {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  size: number;
  uploadedBy: string;
  department: string;
  classification?: ClearanceLevel;
  theater?: string;
  version: number;
  status: "INDEXED" | "PROCESSING" | "PENDING" | string;
  createdAt: string;
  category?: string;
  tags?: string;
  summary?: string;
  chunksCount?: number;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  department: string;
  missionTheater?: string;
  clearanceLevel?: ClearanceLevel;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  tokenMasked: string;
  scope: string;
  department: string;
  createdAt: string;
  lastUsedAt?: string;
  status: "ACTIVE" | "REVOKED";
  rateLimitPerMin: number;
}

export interface DocumentDiffItem {
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
