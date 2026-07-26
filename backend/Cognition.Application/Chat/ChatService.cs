using Cognition.Application.DTOs;
using Cognition.AI.Agents;
using Cognition.Domain.Entities;
using Cognition.Domain.Interfaces;
using System.Text.Json;

namespace Cognition.Application.Chat;

public interface IChatService
{
    Task<ChatResponse> AskAsync(Guid userId, ChatRequest req);
    Task<IEnumerable<Conversation>> GetHistoryAsync(Guid userId);
    Task<GeneratedDocResponse> GenerateDocumentAsync(Guid userId, string question, string answer, List<SourceDto> sources);
    Task<IEnumerable<GeneratedDocument>> GetGeneratedAsync(Guid userId);
}

public class ChatService : IChatService
{
    private readonly RagAgentOrchestrator _agent;
    private readonly IConversationRepository _conv;
    private readonly IUserRepository _users;
    private readonly IGeneratedDocumentRepository _gen;
    private readonly IDocumentGenerator _docGen;

    public ChatService(RagAgentOrchestrator agent, IConversationRepository conv,
        IUserRepository users, IGeneratedDocumentRepository gen, IDocumentGenerator docGen)
    {
        _agent = agent; _conv = conv; _users = users; _gen = gen; _docGen = docGen;
    }

    public async Task<ChatResponse> AskAsync(Guid userId, ChatRequest req)
    {
        var user = await _users.GetByIdAsync(userId);
        var conversation = req.ConversationId.HasValue
            ? await _conv.GetByIdAsync(req.ConversationId.Value)
            : null;

        if (conversation == null)
        {
            conversation = new Conversation { UserId = userId, Title = req.Question[..Math.Min(50, req.Question.Length)] };
            await _conv.AddAsync(conversation);
        }

        var sw = System.Diagnostics.Stopwatch.StartNew();
        var result = await _agent.AskAsync(req.Question);
        sw.Stop();

        var sources = result.Sources.Select(s => new SourceDto(s.DocumentTitle, s.PageNumber, s.Excerpt)).ToList();

        await _conv.AddMessageAsync(new Message { ConversationId = conversation.Id, Role = "user", Content = req.Question });
        await _conv.AddMessageAsync(new Message
        {
            ConversationId = conversation.Id,
            Role = "assistant",
            Content = result.Answer,
            Confidence = result.Confidence,
            Sources = JsonSerializer.Serialize(sources)
        });
        await _conv.UpdateTitleAsync(conversation.Id, req.Question[..Math.Min(50, req.Question.Length)]);

        return new ChatResponse(conversation.Id, result.Answer, sources, result.Confidence);
    }

    public async Task<IEnumerable<Conversation>> GetHistoryAsync(Guid userId) =>
        await _conv.GetByUserAsync(userId);

    public async Task<GeneratedDocResponse> GenerateDocumentAsync(Guid userId, string question, string answer, List<SourceDto> sources)
    {
        var user = await _users.GetByIdAsync(userId);
        var request = new GeneratedDocumentRequest
        {
            Question = question,
            Answer = answer,
            UserName = user?.FullName ?? "Inconnu",
            Department = user?.Department ?? "General",
            GeneratedAt = DateTime.UtcNow,
            Sources = sources.Select(s => new SourceReference
            {
                DocumentTitle = s.DocumentTitle,
                PageNumber = s.PageNumber,
                Excerpt = s.Excerpt
            }).ToList()
        };
        var bytes = _docGen.Generate(request);
        var fileName = $"Misaina_Cognition_{DateTime.UtcNow:yyyyMMddHHmmss}.docx";
        var gen = new GeneratedDocument
        {
            UserId = userId,
            Question = question,
            Answer = answer,
            SourcesJson = JsonSerializer.Serialize(sources),
            FileName = fileName,
            Size = bytes.Length
        };
        await _gen.AddAsync(gen);
        // stocke le fichier (prod: blob storage)
        var dir = Path.Combine(Path.GetTempPath(), "cognition_gen");
        Directory.CreateDirectory(dir);
        await File.WriteAllBytesAsync(Path.Combine(dir, $"{gen.Id}.docx"), bytes);

        return new GeneratedDocResponse(gen.Id, fileName, bytes.Length, gen.CreatedAt);
    }

    public async Task<IEnumerable<GeneratedDocument>> GetGeneratedAsync(Guid userId) =>
        await _gen.GetByUserAsync(userId);
}
