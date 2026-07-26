using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Cognition.Application.Chat;
using Cognition.Domain.Interfaces;
using Cognition.API.Authorization;

namespace Cognition.API.Controllers;

[ApiController]
[Route("api/chat")]
[Authorize]
public class ChatDownloadController : ControllerBase
{
    private readonly IGeneratedDocumentRepository _gen;
    private readonly ResourceGuard _guard;
    public ChatDownloadController(IGeneratedDocumentRepository gen, ResourceGuard guard) => (_gen, _guard) = (gen, guard);

    [HttpGet("download/{id}")]
    [Authorize(Policy = "GENERATE_DOCUMENT")]
    public async Task<IActionResult> Download(Guid id)
    {
        // Isolation: seul le propriétaire (ou ADMIN) peut télécharger son document généré.
        var doc = (await _gen.GetByUserAsync(_guard.CurrentUserId)).FirstOrDefault(g => g.Id == id);
        if (doc == null) return Forbid();

        var path = Path.Combine(Path.GetTempPath(), "cognition_gen", $"{id}.docx");
        if (!System.IO.File.Exists(path)) return NotFound();
        var bytes = await System.IO.File.ReadAllBytesAsync(path);
        return File(bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", doc.FileName);
    }
}
