namespace Cognition.Domain.Entities;

public enum UserRole
{
    ADMIN = 0,
    MANAGER = 1,
    EMPLOYEE = 2,
    GUEST = 3
}

public enum DocumentStatus
{
    Pending = 0,
    Processing = 1,
    Indexed = 2,
    Failed = 3,
    Deleted = 4
}

public enum AccessLevel
{
    None = 0,
    Read = 1,
    Write = 2,
    Owner = 3
}

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Email { get; set; } = default!;
    public string FullName { get; set; } = default!;
    public string PasswordHash { get; set; } = default!;
    public UserRole Role { get; set; } = UserRole.EMPLOYEE;
    public string Department { get; set; } = "General";
    public string? RefreshToken { get; set; }
    public DateTime RefreshTokenExpiry { get; set; }
    public bool IsActive { get; set; } = true;
    public bool EmailConfirmed { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Document> Documents { get; set; } = new List<Document>();
    public ICollection<DocumentPermission> DocumentPermissions { get; set; } = new List<DocumentPermission>();
    public ICollection<Conversation> Conversations { get; set; } = new List<Conversation>();
    public ICollection<GeneratedDocument> GeneratedDocuments { get; set; } = new List<GeneratedDocument>();
}

public class Document
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Title { get; set; } = default!;
    public string FileName { get; set; } = default!;
    public string FileType { get; set; } = default!;
    public long Size { get; set; }
    public Guid UploadedById { get; set; }
    public User UploadedBy { get; set; } = default!;
    public string Department { get; set; } = "General";
    public int Version { get; set; } = 1;
    public Guid? ParentDocumentId { get; set; }
    public string? Category { get; set; }
    public string? Tags { get; set; }
    public DocumentStatus Status { get; set; } = DocumentStatus.Pending;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<DocumentChunk> Chunks { get; set; } = new List<DocumentChunk>();
    public ICollection<DocumentPermission> Permissions { get; set; } = new List<DocumentPermission>();
    public ICollection<AuditLog> AuditLogs { get; set; } = new List<AuditLog>();
}

public class DocumentChunk
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DocumentId { get; set; }
    public Document Document { get; set; } = default!;
    public string Content { get; set; } = default!;
    public int PageNumber { get; set; }
    public int ChunkIndex { get; set; }
    public string? Metadata { get; set; }
    public float[]? Embedding { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class DocumentPermission
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public User User { get; set; } = default!;
    public Guid DocumentId { get; set; }
    public Document Document { get; set; } = default!;
    public AccessLevel AccessLevel { get; set; } = AccessLevel.Read;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Conversation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public User User { get; set; } = default!;
    public string Title { get; set; } = "Nouvelle conversation";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Message> Messages { get; set; } = new List<Message>();
}

public class Message
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ConversationId { get; set; }
    public Conversation Conversation { get; set; } = default!;
    public string Role { get; set; } = "user"; // user | assistant
    public string Content { get; set; } = default!;
    public float Confidence { get; set; }
    public string? Sources { get; set; } // JSON serialized sources
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class AuditLog
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? DocumentId { get; set; }
    public Document? Document { get; set; }
    public Guid? UserId { get; set; }
    public string Action { get; set; } = default!;
    public string? Details { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class GeneratedDocument
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public User User { get; set; } = default!;
    public string Question { get; set; } = default!;
    public string Answer { get; set; } = default!;
    public string? SourcesJson { get; set; }
    public string FileName { get; set; } = default!;
    public long Size { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
