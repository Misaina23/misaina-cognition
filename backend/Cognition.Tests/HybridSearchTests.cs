using Cognition.AI.Rag;
using Cognition.Domain.Entities;
using Cognition.Domain.Interfaces;
using Xunit;

namespace Cognition.Tests.Rag;

public class HybridSearchTests
{
    class FakeRepo : IChunkRepository
    {
        public List<DocumentChunk> Store = new();
        public Task AddRangeAsync(IEnumerable<DocumentChunk> c) { Store.AddRange(c); return Task.CompletedTask; }
        public Task<IEnumerable<DocumentChunk>> GetByDocumentAsync(Guid id) => Task.FromResult(Store.Where(x => x.DocumentId == id));
        public Task<IEnumerable<DocumentChunk>> GetAllAsync() => Task.FromResult(Store.AsEnumerable());
    }

    class FakeVector : IVectorStore
    {
        public Task UpsertAsync(Guid id, float[] v, Dictionary<string, object> p) => Task.CompletedTask;
        public Task DeleteAsync(Guid id) => Task.CompletedTask;
        public Task<IEnumerable<VectorSearchResult>> SearchAsync(float[] v, int k, Dictionary<string, object>? f = null) =>
            Task.FromResult(new[] { new VectorSearchResult { ChunkId = Guid.Empty, Score = 0.9f } }.AsEnumerable());
    }

    class FakeEmbed : IEmbeddingService
    {
        public int Dimensions => 8;
        public Task<float[]> GenerateEmbeddingAsync(string t) =>
            Task.FromResult(t.Select(c => (float)c).Take(8).ToArray());
    }

    [Fact]
    public async Task Search_ReturnsChunks()
    {
        var repo = new FakeRepo();
        repo.Store.Add(new() { Id = Guid.NewGuid(), DocumentId = Guid.NewGuid(), Content = "recrutement collaborateur", PageNumber = 1 });

        var hybrid = new HybridSearch(new FakeVector(), new Bm25Search(repo), repo, new FakeEmbed());
        var result = (await hybrid.SearchAsync("recrutement collaborateur", 5)).ToList();
        Assert.NotEmpty(result);
    }
}
