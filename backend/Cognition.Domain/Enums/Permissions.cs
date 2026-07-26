namespace Cognition.Domain.Enums;

public static class Permissions
{
    public const string UPLOAD_DOCUMENT = "UPLOAD_DOCUMENT";
    public const string VIEW_DOCUMENT = "VIEW_DOCUMENT";
    public const string ASK_AI = "ASK_AI";
    public const string MANAGE_USERS = "MANAGE_USERS";
    public const string VIEW_ANALYTICS = "VIEW_ANALYTICS";
    public const string GENERATE_DOCUMENT = "GENERATE_DOCUMENT";

    public static readonly Dictionary<string, string[]> RolePermissions = new()
    {
        ["ADMIN"] = new[] { UPLOAD_DOCUMENT, VIEW_DOCUMENT, ASK_AI, MANAGE_USERS, VIEW_ANALYTICS, GENERATE_DOCUMENT },
        ["MANAGER"] = new[] { UPLOAD_DOCUMENT, VIEW_DOCUMENT, ASK_AI, VIEW_ANALYTICS, GENERATE_DOCUMENT },
        ["EMPLOYEE"] = new[] { UPLOAD_DOCUMENT, VIEW_DOCUMENT, ASK_AI, GENERATE_DOCUMENT },
        ["GUEST"] = new[] { VIEW_DOCUMENT, ASK_AI }
    };

    public static bool HasPermission(string role, string permission)
    {
        return RolePermissions.TryGetValue(role, out var perms) && perms.Contains(permission);
    }
}
