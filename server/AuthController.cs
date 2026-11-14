using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.Security.Claims;

namespace Relay.Api;

[ApiController, Route("api/auth"), ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class AuthController(SignInManager<IdentityUser> signIn, UserManager<IdentityUser> users) : ControllerBase
{
    [HttpGet("csrf")]
    public object Csrf(IAntiforgery antiforgery) =>
        new { token = antiforgery.GetAndStoreTokens(HttpContext).RequestToken };

    [HttpPost("login"), EnableRateLimiting("login"), RequestSizeLimit(4096)]
    public async Task<IActionResult> Login(LoginInput input)
    {
        var user = await users.FindByEmailAsync(input.Email.Trim());
        if (user is null ||
            !(await signIn.PasswordSignInAsync(user, input.Password, false, lockoutOnFailure: true)).Succeeded)
            return Problem(statusCode: 401, title: "Sign-in failed", detail: "Check your email and password, or try again later.");

        return NoContent();
    }

    [HttpGet("me"), Authorize(Roles = Roles.Members)]
    public object Me() => new { email = User.Identity!.Name, roles = User.FindAll(ClaimTypes.Role).Select(c => c.Value) };

    [HttpPost("logout"), Authorize]
    public async Task<IActionResult> Logout()
    {
        await signIn.SignOutAsync();
        return NoContent();
    }
}

public sealed record LoginInput(
    [Required, EmailAddress, StringLength(256)] string Email,
    [Required, StringLength(256)] string Password);
