using Cognition.Domain.Entities;

namespace Cognition.Domain.Entities;

/// <summary>
/// Jeton de réinitialisation de mot de passe (à usage unique, avec expiration).
/// </summary>
public class PasswordResetToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public User User { get; set; } = default!;
    public string Token { get; set; } = default!;
    public DateTime Expiry { get; set; }
    public bool Used { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
