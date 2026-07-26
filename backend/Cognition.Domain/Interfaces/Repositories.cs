using Cognition.Domain.Entities;

namespace Cognition.Domain.Interfaces;

public interface IUserRepository
{
    Task<User?> GetByIdAsync(Guid id);
    Task<User?> GetByEmailAsync(string email);
    Task<User?> GetByRefreshTokenAsync(string refreshToken);
    Task<IEnumerable<User>> GetAllAsync();
    Task AddAsync(User user);
    Task UpdateAsync(User user);
}

public interface IDocumentRepository
{
    Task<Document?> GetByIdAsync(Guid id);
    Task<IEnumerable<Document>> GetAllAsync();
    Task<IEnumerable<Document>> GetAccessibleAsync(Guid userId, string role, string department);
    Task AddAsync(Document document);
    Task UpdateAsync(Document document);
    Task DeleteAsync(Document document);
    Task<bool> HasAccessAsync(Guid userId, Guid documentId, AccessLevel minLevel);
}

public interface IChunkRepository
{
    Task AddRangeAsync(IEnumerable<DocumentChunk> chunks);
    Task<IEnumerable<DocumentChunk>> GetByDocumentAsync(Guid documentId);
    Task<IEnumerable<DocumentChunk>> GetAllAsync();
}

public interface IConversationRepository
{
    Task<Conversation?> GetByIdAsync(Guid id);
    Task<IEnumerable<Conversation>> GetByUserAsync(Guid userId);
    Task<IEnumerable<Conversation>> GetAllAsync();
    Task AddAsync(Conversation conversation);
    Task UpdateAsync(Conversation conversation);
    Task AddMessageAsync(Message message);
    Task UpdateTitleAsync(Guid conversationId, string title);
}

public interface IGeneratedDocumentRepository
{
    Task AddAsync(GeneratedDocument doc);
    Task<IEnumerable<GeneratedDocument>> GetByUserAsync(Guid userId);
}
