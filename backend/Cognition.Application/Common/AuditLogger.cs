using Cognition.Domain.Entities;

namespace Cognition.Application.Common;

public interface IAuditLogger
{
    System.Threading.Tasks.Task LogAsync(Guid? documentId, Guid? userId, string action, string? details);
}

public class AuditLogger : IAuditLogger
{
    private readonly Cognition.Persistence.CognitionDbContext _db;
    public AuditLogger(Cognition.Persistence.CognitionDbContext db) => _db = db;

    public async System.Threading.Tasks.Task LogAsync(Guid? documentId, Guid? userId, string action, string? details)
    {
        await _db.AuditLogs.AddAsync(new AuditLog
        {
            DocumentId = documentId,
            UserId = userId,
            Action = action,
            Details = details
        });
        await _db.SaveChangesAsync();
    }
}
