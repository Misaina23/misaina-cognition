namespace Cognition.Domain.Interfaces;

public interface IEmbeddingService
{
    Task<float[]> GenerateEmbeddingAsync(string text);
    int Dimensions { get; }
}

public interface IVectorStore
{
    Task UpsertAsync(Guid chunkId, float[] vector, Dictionary<string, object> payload);
    Task<IEnumerable<VectorSearchResult>> SearchAsync(float[] vector, int topK, Dictionary<string, object>? filter = null);
    Task DeleteAsync(Guid chunkId);
}

public class VectorSearchResult
{
    public Guid ChunkId { get; set; }
    public float Score { get; set; }
    public Dictionary<string, object> Payload { get; set; } = new();
}

public interface ITextExtractor
{
    bool Supports(string fileType);
    Task<string> ExtractAsync(Stream stream, string fileType);
}

public interface ILLMService
{
    Task<string> CompleteAsync(string systemPrompt, string userPrompt, CancellationToken ct = default);
}

public interface IDocumentGenerator
{
    byte[] Generate(GeneratedDocumentRequest request);
}

public class GeneratedDocumentRequest
{
    public string Question { get; set; } = default!;
    public string Answer { get; set; } = default!;
    public string UserName { get; set; } = default!;
    public string Department { get; set; } = default!;
    public DateTime GeneratedAt { get; set; }
    public List<SourceReference> Sources { get; set; } = new();
}

public class SourceReference
{
    public string DocumentTitle { get; set; } = default!;
    public int? PageNumber { get; set; }
    public string? Excerpt { get; set; }
}
