using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Cognition.Application.DTOs;
using Cognition.Domain.Entities;
using Cognition.Domain.Enums;
using Cognition.Domain.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace Cognition.Application.Auth;

public interface IAuthService
{
    Task<AuthResponse?> LoginAsync(LoginRequest req);
    Task<AuthResponse> RegisterAsync(RegisterRequest req);
    Task<AuthResponse?> RefreshAsync(RefreshRequest req);
    Task LogoutAsync(string refreshToken);
    Task<bool> RequestPasswordResetAsync(string email, string resetLinkBase);
    Task<(bool success, string message)> ResetPasswordAsync(string token, string newPassword);
    Task<bool> ConfirmEmailAsync(string token);
    Task<string?> GenerateEmailConfirmationTokenAsync(Guid userId);
}

public class AuthService : IAuthService
{
    private readonly IUserRepository _users;
    private readonly IPasswordResetRepository _resets;
    private readonly IEmailSender _email;
    private readonly IConfiguration _config;

    public AuthService(IUserRepository users, IPasswordResetRepository resets, IEmailSender email, IConfiguration config)
    {
        _users = users; _resets = resets; _email = email; _config = config;
    }

    public async Task<AuthResponse?> LoginAsync(LoginRequest req)
    {
        var user = await _users.GetByEmailAsync(req.Email.Trim().ToLowerInvariant());
        if (user == null || !user.IsActive || !Verify(req.Password, user.PasswordHash))
            return null;
        return await IssueToken(user);
    }

    public async Task<AuthResponse> RegisterAsync(RegisterRequest req)
    {
        var email = req.Email.Trim().ToLowerInvariant();
        if (await _users.GetByEmailAsync(email) != null)
            throw new InvalidOperationException("Un compte existe déjà avec cet email.");

        var user = new User
        {
            Email = email,
            FullName = req.FullName,
            PasswordHash = Hash(req.Password),
            Role = Enum.TryParse<UserRole>(req.Role, out var r) ? r : UserRole.EMPLOYEE,
            Department = req.Department,
            EmailConfirmed = false
        };
        await _users.AddAsync(user);

        var token = await GenerateEmailConfirmationTokenAsync(user.Id);
        var link = $"{_config["App:BaseUrl"] ?? "http://localhost:3000"}/verify-email?token={token}";
        await _email.SendAsync(user.Email, "Confirmez votre email Misaina", $"Lien: {link}");

        return await IssueToken(user);
    }

    public async Task<AuthResponse?> RefreshAsync(RefreshRequest req)
    {
        var user = await _users.GetByRefreshTokenAsync(req.RefreshToken);
        if (user == null || user.RefreshTokenExpiry <= DateTime.UtcNow) return null;
        return await IssueToken(user);
    }

    public async Task LogoutAsync(string refreshToken)
    {
        var user = await _users.GetByRefreshTokenAsync(refreshToken);
        if (user == null) return;
        user.RefreshToken = null;
        await _users.UpdateAsync(user);
    }

    public async Task<bool> RequestPasswordResetAsync(string email, string resetLinkBase)
    {
        var user = await _users.GetByEmailAsync(email.Trim().ToLowerInvariant());
        if (user == null) return false; // ne pas révéler l'existence du compte

        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48))
            .Replace("+", "-").Replace("/", "_").Replace("=", "");
        await _resets.AddAsync(new PasswordResetToken
        {
            UserId = user.Id,
            Token = token,
            Expiry = DateTime.UtcNow.AddHours(1)
        });

        var link = $"{resetLinkBase}/reset-password?token={token}";
        await _email.SendAsync(user.Email, "Réinitialisation du mot de passe", $"Lien: {link}");
        return true;
    }

    public async Task<(bool success, string message)> ResetPasswordAsync(string token, string newPassword)
    {
        var reset = await _resets.GetValidAsync(token);
        if (reset == null) return (false, "Jeton invalide ou expiré.");
        if (newPassword.Length < 6) return (false, "Le mot de passe doit faire au moins 6 caractères.");

        reset.User.PasswordHash = Hash(newPassword);
        reset.User.UpdatedAt = DateTime.UtcNow;
        await _users.UpdateAsync(reset.User);
        await _resets.MarkUsedAsync(reset);
        return (true, "Mot de passe réinitialisé avec succès.");
    }

    public async Task<bool> ConfirmEmailAsync(string token)
    {
        var reset = await _resets.GetValidAsync(token);
        if (reset == null) return false;
        reset.User.EmailConfirmed = true;
        await _users.UpdateAsync(reset.User);
        await _resets.MarkUsedAsync(reset);
        return true;
    }

    public async Task<string?> GenerateEmailConfirmationTokenAsync(Guid userId)
    {
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48))
            .Replace("+", "-").Replace("/", "_").Replace("=", "");
        await _resets.AddAsync(new PasswordResetToken
        {
            UserId = userId,
            Token = token,
            Expiry = DateTime.UtcNow.AddDays(2)
        });
        return token;
    }

    private async Task<AuthResponse> IssueToken(User user)
    {
        var key = Encoding.UTF8.GetBytes(_config["JWT:Key"] ?? "misaina_cognition_super_secret_key_change_in_prod_1234567890");
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role.ToString()),
            new Claim("department", user.Department),
            new Claim("fullName", user.FullName)
        };
        var token = new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
            issuer: _config["JWT:Issuer"] ?? "cognition",
            audience: _config["JWT:Audience"] ?? "cognition",
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(30),
            signingCredentials: new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256)));

        user.RefreshToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
        user.RefreshTokenExpiry = DateTime.UtcNow.AddDays(7);
        await _users.UpdateAsync(user);

        return new AuthResponse(token, user.RefreshToken, user.Email, user.FullName,
            user.Role.ToString(), user.Department, user.Id);
    }

    public static string Hash(string pw)
    {
        using var sha = SHA256.Create();
        return Convert.ToBase64String(sha.ComputeHash(Encoding.UTF8.GetBytes(pw)));
    }
    private static bool Verify(string pw, string hash) => Hash(pw) == hash;
}
