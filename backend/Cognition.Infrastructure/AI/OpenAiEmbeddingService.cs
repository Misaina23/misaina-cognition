using System.Net.Http.Json;
using System.Text.Json;
using Cognition.Domain.Interfaces;
using Microsoft.Extensions.Configuration;

namespace Cognition.Infrastructure.AI;

public class OpenAiEmbeddingService : IEmbeddingService
{
    private readonly HttpClient _http;
    private readonly string _model;
    public int Dimensions { get; }

    public OpenAiEmbeddingService(HttpClient http, IConfiguration config)
    {
        _http = http;
        _model = config["AI:Embedding:Model"] ?? "text-embedding-3-small";
        Dimensions = int.Parse(config["AI:Embedding:Dimensions"] ?? "1536");
        var key = config["AI:Embedding:ApiKey"];
        if (!string.IsNullOrEmpty(key))
            _http.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", key);
    }

    public async Task<float[]> GenerateEmbeddingAsync(string text)
    {
        var payload = new { input = text, model = _model };
        using var resp = await _http.PostAsJsonAsync(
            config_url(), payload);
        resp.EnsureSuccessStatusCode();
        var json = await resp.Content.ReadFromJsonAsync<JsonElement>();
        var data = json.GetProperty("data")[0].GetProperty("embedding");
        return data.EnumerateArray().Select(x => x.GetSingle()).ToArray();
    }

    private string config_url() =>
        (_http.BaseAddress?.ToString() ?? "https://api.openai.com/v1/") + "embeddings";
}
