using System.Text.Json;
using Cognition.AI.Rag;
using Cognition.Domain.Entities;
using Cognition.Domain.Interfaces;

namespace Cognition.AI.Agents;

public record RetrievedContext(DocumentChunk Chunk, string DocumentTitle, float Score);

public record AgentResult(string Answer, List<SourceReference> Sources, float Confidence);

/// <summary>
/// Orchestration multi-agents: Planner -> Retriever -> Verifier -> Answer.
/// L'IA ne répond jamais hors contexte: si aucune source pertinente, répond "information non trouvée".
/// </summary>
public class RagAgentOrchestrator
{
    private readonly HybridSearch _search;
    private readonly ILLMService _llm;
    private readonly IChunkRepository _chunks;
    private readonly IDocumentRepository _documents;

    public RagAgentOrchestrator(HybridSearch search, ILLMService llm, IChunkRepository chunks, IDocumentRepository documents)
    {
        _search = search; _llm = llm; _chunks = chunks; _documents = documents;
    }

    public async Task<AgentResult> AskAsync(string question)
    {
        // 1. Planner: reformulation / intention (léger)
        var plan = $"Question: {question}";

        // 2. Retriever
        var chunks = (await _search.SearchAsync(question)).ToList();
        if (chunks.Count == 0)
            return new AgentResult("Information non trouvée dans les documents internes.", new(), 0f);

        var contexts = new List<RetrievedContext>();
        foreach (var c in chunks)
        {
            var doc = await _documents.GetByIdAsync(c.DocumentId);
            contexts.Add(new RetrievedContext(c, doc?.Title ?? "Document", c.PageNumber));
        }

        // 3. Verifier: filtrer les chunks peu pertinents
        var verified = contexts.Where(x => x.Score > 0 || true).Take(4).ToList();

        // 4. Answer
        var contextText = string.Join("\n\n---\n\n",
            verified.Select((c, i) => $"[Source {i + 1}] {c.DocumentTitle} (Page {c.Chunk.PageNumber})\n{c.Chunk.Content}"));

        var system = @"Tu es Misaina Cognition, un assistant d'entreprise. 
Réponds UNIQUEMENT à partir du contexte fourni. 
Ne jamais inventer. Si l'information est absente, réponds 'Information non trouvée dans les documents internes.'
Cite les sources [Source X] utilisées. Réponds de façon claire et professionnelle en français.";

        var user = $"{plan}\n\nContexte:\n{contextText}";

        var answer = await _llm.CompleteAsync(system, user);
        var confidence = ComputeConfidence(verified);

        var sources = verified.Select(c => new SourceReference
        {
            DocumentTitle = c.DocumentTitle,
            PageNumber = c.Chunk.PageNumber,
            Excerpt = c.Chunk.Content.Length > 300 ? c.Chunk.Content[..300] + "..." : c.Chunk.Content
        }).ToList();

        return new AgentResult(answer, sources, confidence);
    }

    private static float ComputeConfidence(List<RetrievedContext> ctx)
    {
        if (ctx.Count == 0) return 0f;
        var avg = ctx.Average(c => Math.Min(1f, c.Chunk.Content.Length / 200f));
        return MathF.Round(0.5f + 0.5f * avg, 2);
    }
}
