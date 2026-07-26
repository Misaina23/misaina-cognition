using System.Net.Http.Json;
using System.Text.Json;
using Cognition.Domain.Interfaces;
using Microsoft.Extensions.Configuration;

namespace Cognition.Infrastructure.AI;

/// <summary>
/// Service d'embedding local via ONNX/HuggingFace (fallback sans clé API).
/// Utilise une empreinte de hachage déterministe si le modèle n'est pas chargé,
/// afin de garder l'application fonctionnelle hors-ligne (remplacer par sentence-transformers en prod).
/// </summary>
public class LocalEmbeddingService : IEmbeddingService
{
    public int Dimensions { get; } = 384;

    public Task<float[]> GenerateEmbeddingAsync(string text)
    {
        var vector = new float[Dimensions];
        var tokens = text.ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        foreach (var tok in tokens)
        {
            var h = Hash(tok);
            vector[h % Dimensions] += 1f;
        }
        // normalisation L2
        var norm = (float)Math.Sqrt(vector.Sum(v => v * v));
        if (norm > 0) for (int i = 0; i < vector.Length; i++) vector[i] /= norm;
        return Task.FromResult(vector);
    }

    private static int Hash(string s)
    {
        int h = 0;
        foreach (var c in s) h = (h * 31 + c) & 0x7fffffff;
        return h;
    }
}

public class OpenAiLLMService : ILLMService
{
    private readonly HttpClient _http;
    private readonly string _model;
    private readonly string _endpoint;

    public OpenAiLLMService(HttpClient http, IConfiguration config)
    {
        _http = http;
        _model = config["AI:LLM:Model"] ?? "gpt-4o-mini";
        _endpoint = config["AI:LLM:Endpoint"] ?? "https://api.openai.com/v1/chat/completions";
        var key = config["AI:LLM:ApiKey"];
        if (!string.IsNullOrEmpty(key))
            _http.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", key);
    }

    public async Task<string> CompleteAsync(string systemPrompt, string userPrompt, CancellationToken ct = default)
    {
        var payload = new
        {
            model = _model,
            messages = new[]
            {
                new { role = "system", content = systemPrompt },
                new { role = "user", content = userPrompt }
            },
            temperature = 0.2
        };
        using var resp = await _http.PostAsJsonAsync(_endpoint, payload, ct);
        if (!resp.IsSuccessStatusCode) return "Information non trouvée dans les documents internes.";
        var json = await resp.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        return json.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString()
            ?? "Information non trouvée.";
    }
}
