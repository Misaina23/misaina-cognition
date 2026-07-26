using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Cognition.Application.Admin;

namespace Cognition.API.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class AdminController : ControllerBase
{
    private readonly IDashboardService _dash;
    private readonly IAdminService _admin;
    public AdminController(IDashboardService dash, IAdminService admin)
    {
        _dash = dash; _admin = admin;
    }

    [HttpGet("dashboard/statistics")]
    [Authorize(Policy = "VIEW_ANALYTICS")]
    public async Task<IActionResult> Stats()
    {
        var role = User.FindFirst(System.Security.Claims.ClaimTypes.Role)!.Value;
        return Ok(await _dash.GetStatsAsync(role));
    }

    [HttpGet("users")]
    [Authorize(Policy = "MANAGE_USERS")]
    public async Task<IActionResult> Users() => Ok(await _admin.ListUsersAsync());

    [HttpGet("dashboard/mine")]
    [Authorize]
    public async Task<IActionResult> Mine()
    {
        var userId = Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        return Ok(await _dash.GetPersonalStatsAsync(userId));
    }
}
