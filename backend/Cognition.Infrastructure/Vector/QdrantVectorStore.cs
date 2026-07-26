using System.Net.Http.Json;
using System.Text.Json;
using Cognition.Domain.Interfaces;
using Microsoft.Extensions.Configuration;

namespace Cognition.Infrastructure.Vector;

/// <summary>
/// Vector store Qdrant via HTTP API. Fallback pgvector disponible dans Cognition.Persistence.
/// </summary>
public class QdrantVectorStore : IVectorStore
{
    private readonly HttpClient _http;
    private readonly string _collection;

    public QdrantVectorStore(HttpClient http, IConfiguration config)
    {
        _http = http;
        _collection = config["Vector:Collection"] ?? "cognition_chunks";
        if (_http.BaseAddress == null)
        {
            var url = config["Vector:QdrantUrl"];
            _http.BaseAddress = string.IsNullOrWhiteSpace(url) ? new Uri("http://localhost:6333") : new Uri(url);
        }
    }

    public async Task UpsertAsync(Guid chunkId, float[] vector, Dictionary<string, object> payload)
    {
        var body = new
        {
            points = new[]
            {
                new
                {
                    id = chunkId.ToString(),
                    vector,
                    payload
                }
            }
        };
        using var resp = await _http.PutAsJsonAsync($"/collections/{_collection}/points", body);
        resp.EnsureSuccessStatusCode();
    }

    public async Task<IEnumerable<VectorSearchResult>> SearchAsync(float[] vector, int topK, Dictionary<string, object>? filter = null)
    {
        var body = new
        {
            vector,
            limit = topK,
            with_payload = true,
            filter = (object?)null
        };
        using var resp = await _http.PostAsJsonAsync($"/collections/{_collection}/points/search", body);
        if (!resp.IsSuccessStatusCode) return Enumerable.Empty<VectorSearchResult>();
        var json = await resp.Content.ReadFromJsonAsync<JsonElement>();
        var results = new List<VectorSearchResult>();
        if (json.TryGetProperty("result", out var arr))
        {
            foreach (var item in arr.EnumerateArray())
            {
                var id = Guid.Parse(item.GetProperty("id").GetString() ?? Guid.Empty.ToString());
                var score = item.GetProperty("score").GetSingle();
                var payload = new Dictionary<string, object>();
                if (item.TryGetProperty("payload", out var p))
                    foreach (var prop in p.EnumerateObject())
                        payload[prop.Name] = prop.Value.ToString();
                results.Add(new VectorSearchResult { ChunkId = id, Score = score, Payload = payload });
            }
        }
        return results;
    }

    public async Task DeleteAsync(Guid chunkId)
    {
        var body = new { points = new[] { chunkId.ToString() } };
        using var resp = await _http.PostAsJsonAsync($"/collections/{_collection}/points/delete", body);
    }
}
