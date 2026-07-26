using Cognition.Domain.Entities;
using Cognition.Domain.Interfaces;

namespace Cognition.AI.Rag;

/// <summary>
/// Fusion RRF (Reciprocal Rank Fusion) entre recherche vectorielle et BM25,
/// suivie d'un re-ranking simple par score combiné.
/// </summary>
public class HybridSearch
{
    private readonly IVectorStore _vector;
    private readonly Bm25Search _bm25;
    private readonly IChunkRepository _chunks;
    private readonly IEmbeddingService _embeddings;

    public HybridSearch(IVectorStore vector, Bm25Search bm25, IChunkRepository chunks, IEmbeddingService embeddings)
    {
        _vector = vector; _bm25 = bm25; _chunks = chunks; _embeddings = embeddings;
    }

    public async Task<IEnumerable<DocumentChunk>> SearchAsync(string query, int topK = 6)
    {
        var qVec = await _embeddings.GenerateEmbeddingAsync(query);
        var vectorResults = (await _vector.SearchAsync(qVec, topK * 2)).ToList();
        var bm25Results = (await _bm25.SearchAsync(query, topK * 2)).ToList();

        var rrf = new Dictionary<Guid, float>();
        const float k = 60f;
        for (int i = 0; i < vectorResults.Count; i++)
            rrf[vectorResults[i].ChunkId] = rrf.GetValueOrDefault(vectorResults[i].ChunkId) + 1 / (k + i + 1);
        for (int i = 0; i < bm25Results.Count; i++)
            rrf[bm25Results[i].Item1.Id] = rrf.GetValueOrDefault(bm25Results[i].Item1.Id) + 1 / (k + i + 1);

        var ranked = rrf.OrderByDescending(x => x.Value).Take(topK).Select(x => x.Key).ToList();
        var allChunks = (await _chunks.GetAllAsync()).ToDictionary(c => c.Id);
        return ranked.Where(id => allChunks.ContainsKey(id)).Select(id => allChunks[id]);
    }
}
