namespace Cognition.Application.DTOs;

public record LoginRequest(string Email, string Password);
public record RegisterRequest(string Email, string FullName, string Password, string Role, string Department);
public record AuthResponse(string Token, string RefreshToken, string Email, string FullName, string Role, string Department, Guid UserId);
public record RefreshRequest(string RefreshToken);

public record DocumentDto(Guid Id, string Title, string FileName, string FileType, long Size,
    string UploadedBy, string Department, int Version, string Status, DateTime CreatedAt);

public record UploadDocumentResponse(Guid Id, string Title, string Status);

public record ChatRequest(Guid? ConversationId, string Question);
public record SourceDto(string DocumentTitle, int? PageNumber, string? Excerpt);
public record ChatResponse(Guid ConversationId, string Answer, List<SourceDto> Sources, float Confidence);

public record GeneratedDocResponse(Guid Id, string FileName, long Size, DateTime CreatedAt);

public record DashboardStats(
    int TotalDocuments, int TotalUsers, int TotalQuestions,
    List<MostConsultedDto> MostConsulted, double AvgResponseTimeMs);

public record MostConsultedDto(string Title, int Hits);
