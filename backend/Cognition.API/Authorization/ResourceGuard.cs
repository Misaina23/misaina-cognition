using Cognition.Domain.Entities;
using Cognition.Domain.Interfaces;
using Microsoft.AspNetCore.Http;

namespace Cognition.API.Authorization;

/// <summary>
/// Vérifie qu'un utilisateur (ou ADMIN) a bien le droit d'accéder à une ressource.
/// Garantit l'isolation des données entre utilisateurs.
/// </summary>
public class ResourceGuard
{
    private readonly IHttpContextAccessor _ctx;
    private readonly IDocumentRepository _docs;

    public ResourceGuard(IHttpContextAccessor ctx, IDocumentRepository docs)
    {
        _ctx = ctx; _docs = docs;
    }

    public Guid CurrentUserId =>
        Guid.Parse(_ctx.HttpContext!.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);

    public bool IsAdmin =>
        _ctx.HttpContext!.User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value == "ADMIN";

    public async Task<bool> CanAccessDocumentAsync(Guid documentId, AccessLevel min = AccessLevel.Read)
    {
        if (IsAdmin) return true;
        return await _docs.HasAccessAsync(CurrentUserId, documentId, min);
    }
}
