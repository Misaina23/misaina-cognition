using Cognition.Application.DTOs;
using Cognition.Domain.Entities;
using Cognition.Domain.Interfaces;

namespace Cognition.Application.Admin;

public interface IDashboardService
{
    Task<DashboardStats> GetStatsAsync(string role);
    Task<PersonalStats> GetPersonalStatsAsync(Guid userId);
}

public interface IAdminService
{
    Task<IEnumerable<User>> ListUsersAsync();
    Task<IEnumerable<GeneratedDocument>> ListGeneratedAsync();
}

public record PersonalStats(
    int MyDocuments,
    int MyConversations,
    int MyQuestions,
    int MyGeneratedDocs,
    List<RecentActivityDto> RecentActivity);

public record RecentActivityDto(string Type, string Title, DateTime At);

public class DashboardService : IDashboardService
{
    private readonly IDocumentRepository _docs;
    private readonly IUserRepository _users;
    private readonly IConversationRepository _conv;
    private readonly IGeneratedDocumentRepository _gen;

    public DashboardService(IDocumentRepository docs, IUserRepository users,
        IConversationRepository conv, IGeneratedDocumentRepository gen)
    {
        _docs = docs; _users = users; _conv = conv; _gen = gen;
    }

    public async Task<DashboardStats> GetStatsAsync(string role)
    {
        var docs = await _docs.GetAllAsync();
        var users = await _users.GetAllAsync();
        var convs = await _conv.GetAllAsync();
        var totalQuestions = convs.Sum(c => c.Messages.Count(m => m.Role == "user"));

        var mostConsulted = docs
            .GroupBy(d => d.Department)
            .Select(g => new MostConsultedDto(g.Key, g.Count()))
            .OrderByDescending(x => x.Hits).Take(5).ToList();

        return new DashboardStats(docs.Count(), users.Count(), totalQuestions, mostConsulted, 850.0);
    }

    public async Task<PersonalStats> GetPersonalStatsAsync(Guid userId)
    {
        var docs = (await _docs.GetAllAsync()).Where(d => d.UploadedById == userId).ToList();
        var convs = (await _conv.GetByUserAsync(userId)).ToList();
        var questions = convs.Sum(c => c.Messages.Count(m => m.Role == "user"));
        var generated = (await _gen.GetByUserAsync(userId)).ToList();

        var recent = new List<RecentActivityDto>();
        recent.AddRange(docs.Select(d => new RecentActivityDto("Document", d.Title, d.CreatedAt)));
        recent.AddRange(generated.Select(g => new RecentActivityDto("Document généré", g.FileName, g.CreatedAt)));
        recent = recent.OrderByDescending(r => r.At).Take(5).ToList();

        return new PersonalStats(docs.Count, convs.Count, questions, generated.Count, recent);
    }
}

public class AdminService : IAdminService
{
    private readonly IUserRepository _users;
    private readonly IGeneratedDocumentRepository _gen;
    public AdminService(IUserRepository users, IGeneratedDocumentRepository gen)
    {
        _users = users; _gen = gen;
    }
    public async Task<IEnumerable<User>> ListUsersAsync() => await _users.GetAllAsync();
    public async Task<IEnumerable<GeneratedDocument>> ListGeneratedAsync() =>
        (await _gen.GetByUserAsync(Guid.Empty)).ToList();
}
