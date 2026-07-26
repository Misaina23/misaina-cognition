using Cognition.Domain.Entities;
using Cognition.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Cognition.Persistence.Repositories;

public class PasswordResetRepository : IPasswordResetRepository
{
    private readonly CognitionDbContext _db;
    public PasswordResetRepository(CognitionDbContext db) => _db = db;

    public async Task AddAsync(PasswordResetToken token)
    {
        await _db.PasswordResetTokens.AddAsync(token);
        await _db.SaveChangesAsync();
    }

    public async Task<PasswordResetToken?> GetValidAsync(string token)
    {
        return await _db.PasswordResetTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.Token == token && !t.Used && t.Expiry > DateTime.UtcNow);
    }

    public async Task MarkUsedAsync(PasswordResetToken token)
    {
        token.Used = true;
        _db.PasswordResetTokens.Update(token);
        await _db.SaveChangesAsync();
    }
}

/// <summary>
/// Implémentation console/logger (à remplacer par SMTP). En dev, affiche le lien dans la console.
/// </summary>
public class ConsoleEmailSender : IEmailSender
{
    public Task SendAsync(string to, string subject, string body)
    {
        Console.WriteLine($"[EMAIL] To={to} Subject={subject}\n{body}");
        return Task.CompletedTask;
    }
}
