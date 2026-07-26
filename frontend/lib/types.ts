export interface Source {
  documentTitle: string;
  pageNumber?: number;
  excerpt?: string;
}
export interface ChatResponse {
  conversationId: string;
  answer: string;
  sources: Source[];
  confidence: number;
}
export interface DocumentDto {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  size: number;
  uploadedBy: string;
  department: string;
  version: number;
  status: string;
  createdAt: string;
}
export interface DashboardStats {
  totalDocuments: number;
  totalUsers: number;
  totalQuestions: number;
  mostConsulted: { title: string; hits: number }[];
  avgResponseTimeMs: number;
}
