using Cognition.AI.Rag;
using Xunit;

namespace Cognition.Tests.Rag;

public class IntelligentChunkerTests
{
    [Fact]
    public void Chunk_SplitsLargeText_IntoMultipleChunks()
    {
        var chunker = new IntelligentChunker();
        var text = "[PAGE 1]\n" + string.Join(" ", Enumerable.Repeat("mot", 5000));
        var chunks = chunker.Chunk(text, Guid.NewGuid()).ToList();
        Assert.True(chunks.Count > 1);
        Assert.All(chunks, c => Assert.False(string.IsNullOrWhiteSpace(c.Content)));
    }

    [Fact]
    public void Chunk_AssignsPageNumber()
    {
        var chunker = new IntelligentChunker();
        var text = "[PAGE 3]\nContenu de test.";
        var chunk = chunker.Chunk(text, Guid.NewGuid()).First();
        Assert.Equal(3, chunk.PageNumber);
    }
}

public class Bm25SearchTests
{
    private class FakeChunkRepo : Cognition.Domain.Interfaces.IChunkRepository
    {
        public List<Cognition.Domain.Entities.DocumentChunk> Store = new();
        public Task AddRangeAsync(IEnumerable<Cognition.Domain.Entities.DocumentChunk> c)
        { Store.AddRange(c); return Task.CompletedTask; }
        public Task<IEnumerable<Cognition.Domain.Entities.DocumentChunk>> GetByDocumentAsync(Guid id)
            => Task.FromResult(Store.Where(x => x.DocumentId == id));
        public Task<IEnumerable<Cognition.Domain.Entities.DocumentChunk>> GetAllAsync()
            => Task.FromResult(Store.AsEnumerable());
    }

    [Fact]
    public async Task Search_ReturnsRelevantChunkFirst()
    {
        var repo = new FakeChunkRepo();
        var docId = Guid.NewGuid();
        repo.Store.Add(new() { DocumentId = docId, Content = "procédure de recrutement nouveau collaborateur", PageNumber = 1 });
        repo.Store.Add(new() { DocumentId = docId, Content = "factures et paiement fournisseur", PageNumber = 5 });

        var bm25 = new Bm25Search(repo);
        var results = (await bm25.SearchAsync("recrutement collaborateur", 5)).ToList();

        Assert.NotEmpty(results);
        Assert.Contains("recrutement", results.First().Chunk.Content);
    }
}
