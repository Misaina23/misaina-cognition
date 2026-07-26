using System.Text;
using System.Text.Json;
using Cognition.AI.Agents;
using Cognition.AI.Rag;
using Cognition.Application.Admin;
using Cognition.Application.Auth;
using Cognition.Application.Chat;
using Cognition.Application.Common;
using Cognition.Application.Documents;
using Cognition.Application.DTOs;
using Cognition.Domain.Entities;
using Cognition.Domain.Enums;
using Cognition.Domain.Interfaces;
using Cognition.Infrastructure.AI;
using Cognition.Infrastructure.Extraction;
using Cognition.Infrastructure.Generation;
using Cognition.Infrastructure.Vector;
using Cognition.API.Authorization;
using Cognition.Persistence;
using Cognition.Persistence.Repositories;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Database
var conn = builder.Configuration.GetConnectionString("Default") ?? "Host=localhost;Port=5432;Database=cognition;Username=postgres;Password=12345";
builder.Services.AddDbContext<CognitionDbContext>(o => o.UseNpgsql(conn));

// Repositories
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IDocumentRepository, DocumentRepository>();
builder.Services.AddScoped<IChunkRepository, ChunkRepository>();
builder.Services.AddScoped<IConversationRepository, ConversationRepository>();
builder.Services.AddScoped<IGeneratedDocumentRepository, GeneratedDocumentRepository>();
builder.Services.AddScoped<IPasswordResetRepository, PasswordResetRepository>();
builder.Services.AddScoped<IAuditLogger, AuditLogger>();
builder.Services.AddSingleton<IEmailSender, ConsoleEmailSender>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ResourceGuard>();

// Extractors
builder.Services.AddSingleton<ITextExtractor, PdfPigExtractor>();
builder.Services.AddSingleton<ITextExtractor, WordExtractor>();
builder.Services.AddSingleton<ITextExtractor, ExcelExtractor>();
builder.Services.AddSingleton<ITextExtractor, PowerPointExtractor>();
builder.Services.AddSingleton<ITextExtractor, PlainTextExtractor>();
builder.Services.AddSingleton<CompositeTextExtractor>();

// AI services
var useLocalEmbeddings = string.IsNullOrEmpty(builder.Configuration["AI:Embedding:ApiKey"]);
if (useLocalEmbeddings)
    builder.Services.AddSingleton<IEmbeddingService, LocalEmbeddingService>();
else
    builder.Services.AddSingleton<IEmbeddingService, OpenAiEmbeddingService>();

builder.Services.AddHttpClient<OpenAiLLMService>();
builder.Services.AddSingleton<ILLMService>(sp =>
{
    if (!string.IsNullOrEmpty(builder.Configuration["AI:LLM:ApiKey"]))
        return sp.GetRequiredService<OpenAiLLMService>();
    return new LocalLLMFallback();
});
builder.Services.AddHttpClient<OpenAiEmbeddingService>();

var qdrantUrl = builder.Configuration["Vector:QdrantUrl"];
if (!string.IsNullOrWhiteSpace(qdrantUrl))
{
    builder.Services.AddHttpClient<QdrantVectorStore>();
    builder.Services.AddSingleton<IVectorStore>(sp => sp.GetRequiredService<QdrantVectorStore>());
}
else
{
    builder.Services.AddSingleton<IVectorStore, InMemoryVectorStore>();
}

builder.Services.AddSingleton<IDocumentGenerator, WordDocumentGenerator>();

// RAG
builder.Services.AddSingleton<IntelligentChunker>();
builder.Services.AddSingleton<Bm25Search>();
builder.Services.AddSingleton<HybridSearch>();
builder.Services.AddSingleton<RagAgentOrchestrator>();

// Application services
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IDocumentService, DocumentService>();
builder.Services.AddScoped<IChatService, ChatService>();
builder.Services.AddScoped<IDashboardService, DashboardService>();
builder.Services.AddScoped<IAdminService, AdminService>();

// Auth
var jwtKey = builder.Configuration["JWT:Key"] ?? "super_secret_key_change_me_1234567890";
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = false, ValidateAudience = false,
        ValidateLifetime = true, ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
    };
});
builder.Services.AddRbacPolicies();

builder.Services.AddCors(o => o.AddPolicy("allow", p =>
    p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<CognitionDbContext>();
    db.Database.EnsureCreated();
    await DbSeeder.SeedAsync(db);
}

app.UseSwagger();
app.UseSwaggerUI();
app.UseCors("allow");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();

public class LocalLLMFallback : ILLMService
{
    public Task<string> CompleteAsync(string systemPrompt, string userPrompt, CancellationToken ct = default)
    {
        var idx = userPrompt.IndexOf("Contexte:", StringComparison.Ordinal);
        var ctx = idx >= 0 ? userPrompt[idx..] : userPrompt;
        var limit = Math.Min(600, ctx.Length);
        return Task.FromResult(
            "Basé sur les documents internes de l'entreprise :\n\n" +
            ctx[..limit].Replace("Contexte:", "").Trim() +
            "\n\n(Réponse générée en mode local — configurez une clé LLM pour une synthèse avancée.)");
    }
}

public class InMemoryVectorStore : IVectorStore
{
    private readonly Dictionary<Guid, (float[] vec, Dictionary<string, object> payload)> _store = new();
    public Task UpsertAsync(Guid chunkId, float[] vector, Dictionary<string, object> payload)
    { _store[chunkId] = (vector, payload); return Task.CompletedTask; }
    public Task<IEnumerable<VectorSearchResult>> SearchAsync(float[] vector, int topK, Dictionary<string, object>? filter = null)
    {
        var results = _store.Select(x => new VectorSearchResult
        {
            ChunkId = x.Key,
            Score = Cosine(x.Value.vec, vector),
            Payload = x.Value.payload
        }).OrderByDescending(r => r.Score).Take(topK);
        return Task.FromResult(results);
    }
    public Task DeleteAsync(Guid chunkId) { _store.Remove(chunkId); return Task.CompletedTask; }
    private static float Cosine(float[] a, float[] b)
    {
        float dot = 0, na = 0, nb = 0;
        for (int i = 0; i < Math.Min(a.Length, b.Length); i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
        return dot / (MathF.Sqrt(na) * MathF.Sqrt(nb) + 1e-9f);
    }
}

public static class DbSeeder
{
    public static async Task SeedAsync(CognitionDbContext db)
    {
        if (await db.Users.AnyAsync()) return;
        var admin = new User
        {
            Email = "admin@misaina.com",
            FullName = "Admin Misaina",
            PasswordHash = AuthService.Hash("Admin123!"),
            Role = UserRole.ADMIN,
            Department = "IT"
        };
        db.Users.Add(admin);
        db.Users.Add(new User
        {
            Email = "rh@misaina.com",
            FullName = "RH Manager",
            PasswordHash = AuthService.Hash("Rh123!"),
            Role = UserRole.MANAGER,
            Department = "RH"
        });
        await db.SaveChangesAsync();
    }
}
