using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Relay.Api;

internal static class Roles
{
    public const string Admin = "Admin";
    public const string User = "User";
    public const string Members = Admin + "," + User;
}

internal static class Provisioning
{
    public static async Task Run(IServiceProvider services, IConfiguration config)
    {
        await using var scope = services.CreateAsyncScope();
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<AppDb>();
        await db.Database.MigrateAsync();
        var roles = sp.GetRequiredService<RoleManager<IdentityRole>>();
        var users = sp.GetRequiredService<UserManager<IdentityUser>>();

        foreach (var role in new[] { Roles.Admin, Roles.User })
        {
            if (!await roles.RoleExistsAsync(role))
                Check(await roles.CreateAsync(new IdentityRole(role)));
        }

        foreach (var role in new[] { Roles.Admin, Roles.User })
        {
            var email = config[$"Bootstrap:{role}:Email"]?.Trim();
            var password = config[$"Bootstrap:{role}:Password"];
            if (string.IsNullOrEmpty(email) && string.IsNullOrEmpty(password)) continue;
            if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(password))
                throw new InvalidOperationException($"Supply both bootstrap settings for {role}.");
            var user = await users.FindByEmailAsync(email);
            if (user is not null)
            {
                if (!await users.IsInRoleAsync(user, role))
                    throw new InvalidOperationException($"The bootstrap email for {role} already belongs to another role.");
                continue;
            }

            await using var transaction = await db.Database.BeginTransactionAsync();
            user = new IdentityUser { UserName = email, Email = email };
            Check(await users.CreateAsync(user, password));
            Check(await users.AddToRoleAsync(user, role));
            await transaction.CommitAsync();
        }
    }

    private static void Check(IdentityResult result)
    {
        if (!result.Succeeded)
            throw new InvalidOperationException(string.Join("; ", result.Errors.Select(e => e.Description)));
    }
}
