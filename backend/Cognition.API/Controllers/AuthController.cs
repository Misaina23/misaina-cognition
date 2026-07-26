using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Cognition.Application.Auth;
using Cognition.Application.DTOs;

namespace Cognition.API.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _auth;
    public AuthController(IAuthService auth) => _auth = auth;

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        var res = await _auth.LoginAsync(req);
        return res == null ? Unauthorized(new { message = "Identifiants invalides" }) : Ok(res);
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest req)
    {
        try
        {
            var res = await _auth.RegisterAsync(req);
            return Ok(res);
        }
        catch (InvalidOperationException e)
        {
            return Conflict(new { message = e.Message });
        }
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest req)
    {
        var res = await _auth.RefreshAsync(req);
        return res == null ? Unauthorized() : Ok(res);
    }

    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout()
    {
        var token = Request.Headers["Authorization"].ToString().Replace("Bearer ", "");
        await _auth.LogoutAsync(User.FindFirst("refreshToken")?.Value ?? "");
        return Ok(new { message = "Déconnecté" });
    }

    [HttpPost("forgot-password")]
    public async Task<IActionResult> Forgot([FromBody] ForgotRequest req)
    {
        var baseUrl = $"{Request.Scheme}://{Request.Host}";
        await _auth.RequestPasswordResetAsync(req.Email, baseUrl);
        // Toujours 200 pour ne pas révéler l'existence du compte
        return Ok(new { message = "Si le compte existe, un email a été envoyé." });
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> Reset([FromBody] ResetRequest req)
    {
        var (success, message) = await _auth.ResetPasswordAsync(req.Token, req.Password);
        return success ? Ok(new { message }) : BadRequest(new { message });
    }

    [HttpGet("verify-email")]
    public async Task<IActionResult> Verify([FromQuery] string token)
    {
        var ok = await _auth.ConfirmEmailAsync(token);
        return ok ? Ok(new { message = "Email confirmé." }) : BadRequest(new { message = "Lien invalide ou expiré." });
    }

    [HttpGet("me")]
    [Authorize]
    public IActionResult Me()
    {
        return Ok(new
        {
            id = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value,
            email = User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value,
            fullName = User.FindFirst("fullName")?.Value,
            role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value,
            department = User.FindFirst("department")?.Value
        });
    }
}

public record ForgotRequest(string Email);
public record ResetRequest(string Token, string Password);
