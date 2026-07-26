using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Cognition.Application.Chat;
using Cognition.Application.DTOs;

namespace Cognition.API.Controllers;

[ApiController]
[Route("api/chat")]
[Authorize]
public class ChatController : ControllerBase
{
    private readonly IChatService _svc;
    public ChatController(IChatService svc) => _svc = svc;

    [HttpPost("question")]
    [Authorize(Policy = "ASK_AI")]
    public async Task<IActionResult> Ask([FromBody] ChatRequest req)
    {
        var userId = Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        return Ok(await _svc.AskAsync(userId, req));
    }

    [HttpGet("history")]
    [Authorize(Policy = "ASK_AI")]
    public async Task<IActionResult> History()
    {
        var userId = Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        return Ok(await _svc.GetHistoryAsync(userId));
    }

    [HttpPost("generate-document")]
    [Authorize(Policy = "GENERATE_DOCUMENT")]
    public async Task<IActionResult> Generate([FromBody] GenerateRequest req)
    {
        var userId = Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        return Ok(await _svc.GenerateDocumentAsync(userId, req.Question, req.Answer, req.Sources));
    }

    [HttpGet("generated")]
    [Authorize(Policy = "GENERATE_DOCUMENT")]
    public async Task<IActionResult> Generated()
    {
        var userId = Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        return Ok(await _svc.GetGeneratedAsync(userId));
    }
}

public record GenerateRequest(string Question, string Answer, List<SourceDto> Sources);
