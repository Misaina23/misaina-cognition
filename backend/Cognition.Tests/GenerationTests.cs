using Cognition.Domain.Enums;
using Cognition.Domain.Interfaces;
using Cognition.Infrastructure.Generation;
using Xunit;

namespace Cognition.Tests.Generation;

public class WordGeneratorTests
{
    [Fact]
    public void Generate_ProducesValidDocxBytes()
    {
        var gen = new WordDocumentGenerator();
        var req = new GeneratedDocumentRequest
        {
            Question = "Procédure de recrutement ?",
            Answer = "La période d'essai est de 3 mois.",
            UserName = "Jean Dupont",
            Department = "RH",
            GeneratedAt = DateTime.UtcNow,
            Sources = new() { new() { DocumentTitle = "RH-2026.pdf", PageNumber = 12, Excerpt = "période d'essai" } }
        };
        var bytes = gen.Generate(req);
        Assert.True(bytes.Length > 0);
        // Signature DOCX = PK zip
        Assert.Equal(0x50, bytes[0]);
        Assert.Equal(0x4B, bytes[1]);
    }
}

public class RbacTests
{
    [Theory]
    [InlineData("ADMIN", Permissions.MANAGE_USERS, true)]
    [InlineData("EMPLOYEE", Permissions.MANAGE_USERS, false)]
    [InlineData("GUEST", Permissions.UPLOAD_DOCUMENT, false)]
    [InlineData("MANAGER", Permissions.VIEW_ANALYTICS, true)]
    public void HasPermission_RespectsRole(string role, string perm, bool expected)
    {
        Assert.Equal(expected, Permissions.HasPermission(role, perm));
    }
}
