using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Relay.Api;

public sealed class AppDb(DbContextOptions<AppDb> options) : IdentityDbContext(options)
{
    public DbSet<Project> Projects => Set<Project>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        var projects = builder.Entity<Project>();
        projects.Property(p => p.Name).HasMaxLength(100).IsRequired();
        projects.Property(p => p.Client).HasMaxLength(100).IsRequired();
        projects.Property(p => p.Status).HasConversion<string>().HasMaxLength(20);
        projects.HasIndex(p => new { p.CreatedAt, p.Id });
    }
}

public enum ProjectStatus { Planned, Active, Completed }
public sealed class Project
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Client { get; set; } = "";
    public ProjectStatus Status { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
