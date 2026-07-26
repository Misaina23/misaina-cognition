using Cognition.Application.Common;
using Cognition.Application.DTOs;
using Cognition.AI.Rag;
using Cognition.Domain.Entities;
using Cognition.Domain.Interfaces;
using Microsoft.AspNetCore.Http;

namespace Cognition.Application.Documents;

public interface IDocumentService
{
    Task<UploadDocumentResponse> UploadAsync(IFormFile file, Guid userId, string department, string? category, string? tags);
    Task<IEnumerable<DocumentDto>> ListAccessibleAsync(Guid userId, string role, string department);
    Task<DocumentDto?> GetAsync(Guid id);
    Task DeleteAsync(Guid id);
    Task IndexAsync(Guid documentId);
}

public class DocumentService : IDocumentService
{
    private readonly IDocumentRepository _docs;
    private readonly IChunkRepository _chunks;
    private readonly ITextExtractor _extractor;
    private readonly IEmbeddingService _embeddings;
    private readonly IVectorStore _vector;
    private readonly IAuditLogger _audit;
    private readonly string _storagePath;

    public DocumentService(IDocumentRepository docs, IChunkRepository chunks, ITextExtractor extractor,
        IEmbeddingService embeddings, IVectorStore vector, IAuditLogger audit, IConfiguration config)
    {
        _docs = docs; _chunks = chunks; _extractor = extractor;
        _embeddings = embeddings; _vector = vector; _audit = audit;
        _storagePath = config["Storage:Path"] ?? Path.Combine(Path.GetTempPath(), "cognition");
        Directory.CreateDirectory(_storagePath);
    }

    public async Task<UploadDocumentResponse> UploadAsync(IFormFile file, Guid userId, string department, string? category, string? tags)
    {
        var id = Guid.NewGuid();
        var path = Path.Combine(_storagePath, $"{id}_{file.FileName}");
        await using (var fs = File.Create(path))
            await file.CopyToAsync(fs);

        var doc = new Document
        {
            Id = id,
            Title = Path.GetFileNameWithoutExtension(file.FileName),
            FileName = file.FileName,
            FileType = Path.GetExtension(file.FileName).TrimStart('.'),
            Size = file.Length,
            UploadedById = userId,
            Department = department,
            Category = category,
            Tags = tags,
            Status = DocumentStatus.Processing
        };
        await _docs.AddAsync(doc);
        await _audit.LogAsync(doc.Id, userId, "UPLOAD", file.FileName);

        await IndexAsync(id);
        var indexed = await _docs.GetByIdAsync(id);
        return new UploadDocumentResponse(id, doc.Title, indexed?.Status.ToString() ?? "Processing");
    }

    public async Task IndexAsync(Guid documentId)
    {
        var doc = await _docs.GetByIdAsync(documentId);
        if (doc == null) return;
        try
        {
            var path = Path.Combine(_storagePath, $"{doc.Id}_{doc.FileName}");
            using var fs = File.OpenRead(path);
            var text = await _extractor.ExtractAsync(fs, doc.FileType);

        var chunker = new IntelligentChunker();
        var chunks = chunker.Chunk(text, doc.Id).ToList();
        foreach (var c in chunks)
        {
            var emb = await _embeddings.GenerateEmbeddingAsync(c.Content);
            c.Embedding = emb;
            await _vector.UpsertAsync(c.Id, emb, new Dictionary<string, object>
            {
                ["documentId"] = doc.Id.ToString(),
                ["page"] = c.PageNumber,
                ["content"] = c.Content.Length > 500 ? c.Content[..500] : c.Content
            });
        }
        await _chunks.AddRangeAsync(chunks);
            doc.Status = DocumentStatus.Indexed;
            await _docs.UpdateAsync(doc);
            await _audit.LogAsync(doc.Id, null, "INDEXED", $"{chunks.Count} chunks");
        }
        catch (Exception ex)
        {
            doc.Status = DocumentStatus.Failed;
            await _docs.UpdateAsync(doc);
            await _audit.LogAsync(doc.Id, null, "INDEX_FAILED", ex.Message);
        }
    }

    public async Task<IEnumerable<DocumentDto>> ListAccessibleAsync(Guid userId, string role, string department)
    {
        var docs = await _docs.GetAccessibleAsync(userId, role, department);
        return docs.Select(ToDto);
    }

    public async Task<DocumentDto?> GetAsync(Guid id) => ToDto(await _docs.GetByIdAsync(id));

    public async Task DeleteAsync(Guid id)
    {
        var doc = await _docs.GetByIdAsync(id);
        if (doc == null) return;
        doc.Status = DocumentStatus.Deleted;
        await _docs.UpdateAsync(doc);
        await _audit.LogAsync(id, null, "DELETE", doc.FileName);
    }

    private static DocumentDto ToDto(Document? d) => d == null ? null! : new DocumentDto(
        d.Id, d.Title, d.FileName, d.FileType, d.Size,
        d.UploadedBy?.FullName ?? "?", d.Department, d.Version, d.Status.ToString(), d.CreatedAt);
}
