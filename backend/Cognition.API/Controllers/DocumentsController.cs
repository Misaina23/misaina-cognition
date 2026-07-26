using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Cognition.Application.Documents;
using Cognition.API.Authorization;
using Cognition.Domain.Entities;
using Cognition.Domain.Enums;

namespace Cognition.API.Controllers;

[ApiController]
[Route("api/documents")]
[Authorize]
public class DocumentsController : ControllerBase
{
    private readonly IDocumentService _svc;
    private readonly ResourceGuard _guard;
    public DocumentsController(IDocumentService svc, ResourceGuard guard) => (_svc, _guard) = (svc, guard);

    [HttpPost("upload")]
    [Authorize(Policy = "UPLOAD_DOCUMENT")]
    public async Task<IActionResult> Upload(IFormFile file,
        [FromForm] string? category, [FromForm] string? tags)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { message = "Fichier requis" });
        var userId = Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        var dept = User.FindFirst("department")?.Value ?? "General";
        var res = await _svc.UploadAsync(file, userId, dept, category, tags);
        return Ok(res);
    }

    [HttpGet]
    [Authorize(Policy = "VIEW_DOCUMENT")]
    public async Task<IActionResult> List()
    {
        var userId = Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        var role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)!.Value;
        var dept = User.FindFirst("department")?.Value ?? "General";
        return Ok(await _svc.ListAccessibleAsync(userId, role, dept));
    }

    [HttpGet("{id}")]
    [Authorize(Policy = "VIEW_DOCUMENT")]
    public async Task<IActionResult> Get(Guid id)
    {
        if (!await _guard.CanAccessDocumentAsync(id)) return Forbid();
        return await _svc.GetAsync(id) is { } d ? Ok(d) : NotFound();
    }

    [HttpDelete("{id}")]
    [Authorize(Policy = "UPLOAD_DOCUMENT")]
    public async Task<IActionResult> Delete(Guid id)
    {
        if (!await _guard.CanAccessDocumentAsync(id, AccessLevel.Owner)) return Forbid();
        await _svc.DeleteAsync(id);
        return NoContent();
    }
}
