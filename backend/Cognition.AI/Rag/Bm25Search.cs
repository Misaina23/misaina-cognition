using Cognition.Domain.Entities;
using Cognition.Domain.Interfaces;

namespace Cognition.AI.Rag;

public class Bm25Search
{
    private readonly IChunkRepository _chunks;

    public Bm25Search(IChunkRepository chunks) => _chunks = chunks;

    public async Task<IEnumerable<(DocumentChunk Chunk, float Score)>> SearchAsync(string query, int topK = 8)
    {
        var all = (await _chunks.GetAllAsync()).ToList();
        if (all.Count == 0) return Enumerable.Empty<(DocumentChunk, float)>();

        var terms = Tokenize(query);
        var avgLen = all.Average(c => c.Content.Length);
        const float k1 = 1.5f, b = 0.75f;

        // Document frequency : nombre de chunks contenant chaque terme
        var df = new Dictionary<string, int>();
        foreach (var doc in all)
        {
            foreach (var t in Tokenize(doc.Content).Distinct())
                df[t] = df.GetValueOrDefault(t) + 1;
        }

        var scores = new List<(DocumentChunk, float)>();
        foreach (var doc in all)
        {
            var docTerms = Tokenize(doc.Content);
            var freq = new Dictionary<string, int>();
            foreach (var t in docTerms) freq[t] = freq.GetValueOrDefault(t) + 1;
            var score = 0f;
            foreach (var term in terms.Distinct())
            {
                if (!freq.ContainsKey(term)) continue;
                var n = df.GetValueOrDefault(term);
                var idf = MathF.Log(1 + (all.Count - n + 0.5f) / (n + 0.5f));
                var tf = freq[term];
                score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * ((float)doc.Content.Length / (float)avgLen)));
            }
            if (score > 0) scores.Add((doc, score));
        }
        return scores.OrderByDescending(s => s.Item2).Take(topK);
    }

    private static IEnumerable<string> Tokenize(string s) =>
        System.Text.RegularExpressions.Regex.Split(s.ToLowerInvariant(), @"\W+")
            .Where(t => t.Length > 2);
}
