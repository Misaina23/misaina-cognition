using Cognition.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;

namespace Cognition.API.Authorization;

public class PermissionHandler : AuthorizationHandler<PermissionRequirement>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        var role = context.User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
        var userId = context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (role != null && Permissions.HasPermission(role, requirement.Permission))
            context.Succeed(requirement);
        return Task.CompletedTask;
    }
}

public class PermissionRequirement : IAuthorizationRequirement
{
    public string Permission { get; }
    public PermissionRequirement(string permission) => Permission = permission;
}

public static class PolicyExtensions
{
    public static IServiceCollection AddRbacPolicies(this IServiceCollection services)
    {
        services.AddScoped<IAuthorizationHandler, PermissionHandler>();
        services.AddAuthorization(o =>
        {
            foreach (var perm in new[] { Permissions.UPLOAD_DOCUMENT, Permissions.VIEW_DOCUMENT,
                Permissions.ASK_AI, Permissions.MANAGE_USERS, Permissions.VIEW_ANALYTICS, Permissions.GENERATE_DOCUMENT })
            {
                o.AddPolicy(perm, p => p.Requirements.Add(new PermissionRequirement(perm)));
            }
        });
        return services;
    }
}
