using Cognition.Domain.Entities;

namespace Cognition.Domain.Interfaces;

public interface IPasswordResetRepository
{
    Task AddAsync(PasswordResetToken token);
    Task<PasswordResetToken?> GetValidAsync(string token);
    Task MarkUsedAsync(PasswordResetToken token);
}

/// <summary>
/// Abstraction d'envoi d'email (SMTP réel à brancher en prod).
/// </summary>
public interface IEmailSender
{
    Task SendAsync(string to, string subject, string body);
}
