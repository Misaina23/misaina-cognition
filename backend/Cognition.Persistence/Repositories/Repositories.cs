using Cognition.Domain.Entities;
using Cognition.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Cognition.Persistence.Repositories;

public class UserRepository : IUserRepository
{
    private readonly CognitionDbContext _db;
    public UserRepository(CognitionDbContext db) => _db = db;

    public async Task<User?> GetByIdAsync(Guid id) => await _db.Users.FindAsync(id);
    public async Task<User?> GetByEmailAsync(string email) =>
        await _db.Users.FirstOrDefaultAsync(u => u.Email == email);
    public async Task<User?> GetByRefreshTokenAsync(string refreshToken) =>
        await _db.Users.FirstOrDefaultAsync(u => u.RefreshToken == refreshToken);
    public async Task<IEnumerable<User>> GetAllAsync() => await _db.Users.ToListAsync();
    public async Task AddAsync(User user) { await _db.Users.AddAsync(user); await _db.SaveChangesAsync(); }
    public async Task UpdateAsync(User user) { _db.Users.Update(user); await _db.SaveChangesAsync(); }
}

public class DocumentRepository : IDocumentRepository
{
    private readonly CognitionDbContext _db;
    public DocumentRepository(CognitionDbContext db) => _db = db;

    public async Task<Document?> GetByIdAsync(Guid id) =>
        await _db.Documents.Include(d => d.UploadedBy).FirstOrDefaultAsync(d => d.Id == id);

    public async Task<IEnumerable<Document>> GetAllAsync() =>
        await _db.Documents.Include(d => d.UploadedBy).OrderByDescending(d => d.CreatedAt).ToListAsync();

    public async Task<IEnumerable<Document>> GetAccessibleAsync(Guid userId, string role, string department)
    {
        // ADMIN voit tout ; les autres ne voient QUE leurs documents
        // (ceux qu'ils ont uploadés) ou ceux explicitement partagés via DocumentPermissions.
        if (role == "ADMIN") return await GetAllAsync();

        var permIds = await _db.DocumentPermissions
            .Where(p => p.UserId == userId && p.AccessLevel >= AccessLevel.Read)
            .Select(p => p.DocumentId).ToListAsync();

        return await _db.Documents
            .Include(d => d.UploadedBy)
            .Where(d => d.UploadedById == userId || permIds.Contains(d.Id))
            .OrderByDescending(d => d.CreatedAt).ToListAsync();
    }

    public async Task AddAsync(Document document) { await _db.Documents.AddAsync(document); await _db.SaveChangesAsync(); }
    public async Task UpdateAsync(Document document) { _db.Documents.Update(document); await _db.SaveChangesAsync(); }
    public async Task DeleteAsync(Document document) { _db.Documents.Remove(document); await _db.SaveChangesAsync(); }

    public async Task<bool> HasAccessAsync(Guid userId, Guid documentId, AccessLevel minLevel)
    {
        var doc = await _db.Documents.FirstOrDefaultAsync(d => d.Id == documentId);
        if (doc == null) return false;
        var perm = await _db.DocumentPermissions
            .FirstOrDefaultAsync(p => p.UserId == userId && p.DocumentId == documentId);
        var level = perm?.AccessLevel ?? (doc.Department == (await _db.Users.FindAsync(userId))?.Department
            ? AccessLevel.Read : AccessLevel.None);
        return level >= minLevel;
    }
}

public class ChunkRepository : IChunkRepository
{
    private readonly CognitionDbContext _db;
    public ChunkRepository(CognitionDbContext db) => _db = db;

    public async Task AddRangeAsync(IEnumerable<DocumentChunk> chunks)
    {
        await _db.DocumentChunks.AddRangeAsync(chunks);
        await _db.SaveChangesAsync();
    }
    public async Task<IEnumerable<DocumentChunk>> GetByDocumentAsync(Guid documentId) =>
        await _db.DocumentChunks.Where(c => c.DocumentId == documentId).ToListAsync();
    public async Task<IEnumerable<DocumentChunk>> GetAllAsync() => await _db.DocumentChunks.ToListAsync();
}

public class ConversationRepository : IConversationRepository
{
    private readonly CognitionDbContext _db;
    public ConversationRepository(CognitionDbContext db) => _db = db;

    public async Task<Conversation?> GetByIdAsync(Guid id) =>
        await _db.Conversations.Include(c => c.Messages).FirstOrDefaultAsync(c => c.Id == id);
    public async Task<IEnumerable<Conversation>> GetAllAsync() =>
        await _db.Conversations.Include(c => c.Messages).ToListAsync();
    public async Task<IEnumerable<Conversation>> GetByUserAsync(Guid userId) =>
        await _db.Conversations.Where(c => c.UserId == userId)
            .OrderByDescending(c => c.UpdatedAt).ToListAsync();
    public async Task AddAsync(Conversation c) { await _db.Conversations.AddAsync(c); await _db.SaveChangesAsync(); }
    public async Task UpdateAsync(Conversation c) { _db.Conversations.Update(c); await _db.SaveChangesAsync(); }
    public async Task AddMessageAsync(Message m) { await _db.Messages.AddAsync(m); await _db.SaveChangesAsync(); }
    public async Task UpdateTitleAsync(Guid conversationId, string title)
    {
        var c = await _db.Conversations.FindAsync(conversationId);
        if (c != null) { c.Title = title; c.UpdatedAt = DateTime.UtcNow; await _db.SaveChangesAsync(); }
    }
}

public class GeneratedDocumentRepository : IGeneratedDocumentRepository
{
    private readonly CognitionDbContext _db;
    public GeneratedDocumentRepository(CognitionDbContext db) => _db = db;

    public async Task AddAsync(GeneratedDocument doc)
    { await _db.GeneratedDocuments.AddAsync(doc); await _db.SaveChangesAsync(); }
    public async Task<IEnumerable<GeneratedDocument>> GetByUserAsync(Guid userId) =>
        await _db.GeneratedDocuments.Where(g => g.UserId == userId)
            .OrderByDescending(g => g.CreatedAt).ToListAsync();
}
