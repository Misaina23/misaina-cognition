using Cognition.Application.Auth;
using Cognition.Domain.Entities;
using Cognition.Domain.Interfaces;
using Microsoft.Extensions.Configuration;
using Moq;
using Xunit;

namespace Cognition.Tests.Auth;

public class AuthServiceTests
{
    [Fact]
    public void Hash_IsDeterministic()
    {
        var h1 = AuthService.Hash("secret");
        var h2 = AuthService.Hash("secret");
        Assert.Equal(h1, h2);
    }

    [Fact]
    public async Task Login_ReturnsNull_ForWrongPassword()
    {
        var user = new User { Email = "x@y.com", PasswordHash = AuthService.Hash("right"), IsActive = true };
        var repo = new Mock<IUserRepository>();
        repo.Setup(r => r.GetByEmailAsync("x@y.com")).ReturnsAsync(user);
        var svc = new AuthService(repo.Object, new Mock<IPasswordResetRepository>().Object,
            new Mock<IEmailSender>().Object, new ConfigurationBuilder().Build());

        var res = await svc.LoginAsync(new("x@y.com", "wrong"));
        Assert.Null(res);
    }

    [Fact]
    public async Task Login_ReturnsToken_ForValidCredentials()
    {
        var user = new User { Email = "x@y.com", PasswordHash = AuthService.Hash("pw"), IsActive = true, FullName = "U", Department = "IT", Role = UserRole.EMPLOYEE };
        var repo = new Mock<IUserRepository>();
        repo.Setup(r => r.GetByEmailAsync("x@y.com")).ReturnsAsync(user);
        var cfg = new Microsoft.Extensions.Configuration.ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["JWT:Key"] = "test_key_1234567890_test_key_123" }).Build();
        var svc = new AuthService(repo.Object, new Mock<IPasswordResetRepository>().Object,
            new Mock<IEmailSender>().Object, cfg);

        var res = await svc.LoginAsync(new("x@y.com", "pw"));
        Assert.NotNull(res);
        Assert.False(string.IsNullOrEmpty(res!.Token));
    }
}
