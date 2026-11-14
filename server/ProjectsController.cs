using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Relay.Api;

[ApiController, Route("api/projects"), Authorize(Roles = Roles.Members)]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class ProjectsController(AppDb db) : ControllerBase
{
    [HttpGet]
    public async Task<object> List([FromQuery, Range(1, 100000)] int page = 1,
        [FromQuery, StringLength(100)] string? search = null, CancellationToken ct = default)
    {
        const int pageSize = 12;
        var query = db.Projects.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var pattern = "%" + search.Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
            query = query.Where(p => EF.Functions.ILike(p.Name, pattern, "\\") || EF.Functions.ILike(p.Client, pattern, "\\"));
        }
        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(p => p.CreatedAt).ThenByDescending(p => p.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return new { items, total, page, pageSize };
    }

    [HttpGet("summary")]
    public async Task<object> Summary(CancellationToken ct)
    {
        var counts = await db.Projects.GroupBy(p => p.Status).Select(g => new { status = g.Key, count = g.Count() })
            .ToDictionaryAsync(g => g.status, g => g.count, ct);
        return new { total = counts.Values.Sum(), active = counts.GetValueOrDefault(ProjectStatus.Active),
            completed = counts.GetValueOrDefault(ProjectStatus.Completed) };
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<Project>> Get(int id, CancellationToken ct) =>
        await db.Projects.AsNoTracking().SingleOrDefaultAsync(p => p.Id == id, ct) is { } project
            ? Ok(project) : NotFound();

    [HttpPost, Authorize(Roles = Roles.Admin), RequestSizeLimit(4096)]
    public async Task<ActionResult<Project>> Create(ProjectInput input, CancellationToken ct)
    {
        var project = new Project();
        Apply(project, input);
        db.Projects.Add(project);
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(Get), new { id = project.Id }, project);
    }

    [HttpPut("{id:int}"), Authorize(Roles = Roles.Admin), RequestSizeLimit(4096)]
    public async Task<ActionResult<Project>> Update(int id, ProjectInput input, CancellationToken ct)
    {
        var project = await db.Projects.FindAsync([id], ct);
        if (project is null) return NotFound();
        Apply(project, input);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return Conflict(); }
        return Ok(project);
    }

    [HttpDelete("{id:int}"), Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var affected = await db.Projects.Where(p => p.Id == id).ExecuteDeleteAsync(ct);
        return affected == 0 ? NotFound() : NoContent();
    }

    private static void Apply(Project project, ProjectInput input) =>
        (project.Name, project.Client, project.Status) = (input.Name.Trim(), input.Client.Trim(), input.Status!.Value);
}

public sealed record ProjectInput(
    [Required, StringLength(100)] string Name,
    [Required, StringLength(100)] string Client,
    [Required, EnumDataType(typeof(ProjectStatus))] ProjectStatus? Status);
