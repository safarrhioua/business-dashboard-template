# Relay — full-stack business software starter

Relay is a single-workspace template built with ASP.NET Core 10 Web API, ASP.NET Core Identity, EF Core, PostgreSQL, React and TypeScript. The example Projects module includes a dashboard summary, searchable and paginated list, a create/edit dialog and delete confirmation. Fork one copy per client. Node.js runs the frontend build tools only.

| Role | Access |
| --- | --- |
| Admin | Dashboard, projects (create, read, update, delete), and the administration screen |
| User | Dashboard and read-only project access |

Accounts are provisioned by an operator. There is no public sign-up or default password. The administration screen documents permissions; it does not manage accounts.

## Run locally

Install the .NET 10 SDK, Node.js 22.12+ (an LTS release recommended) and PostgreSQL. Docker Compose is optional. Commands below use PowerShell; on other shells, export the same environment variables.

1. **Start PostgreSQL.** With Docker Compose, copy `.env.example` to `.env`, choose a local database password, then run `docker compose up -d db`. With an existing PostgreSQL server, create a dedicated empty database and a login with ownership of that database. Adjust the connection string accordingly. Use the database password you actually configured.

2. **Initialize and start the API.** Run from the starter root. Replace the placeholders; choose a unique password of at least 12 characters with uppercase, lowercase, digit and punctuation.

   ```powershell
   $env:ASPNETCORE_ENVIRONMENT = 'Development'
   $env:ConnectionStrings__App = 'Host=localhost;Port=5432;Database=relay;Username=relay;Password=YOUR_DB_PASSWORD'
   $env:Bootstrap__Admin__Email = 'admin@relay.test'
   $env:Bootstrap__Admin__Password = 'YOUR_UNIQUE_ADMIN_PASSWORD'
   dotnet run --project server -- initialize
   Remove-Item Env:Bootstrap__Admin__Password,Env:Bootstrap__Admin__Email
   dotnet run --project server -- --urls http://localhost:5080
   ```

   To provision a User too, set `Bootstrap__User__Email` and `Bootstrap__User__Password` before running `initialize`. Clear them afterward. Repeat initialization with a different email to add an account. The command applies migrations, creates missing roles, and provisions only the supplied accounts. Running it again with the same account leaves that account’s password and role unchanged. Run it as a single operator job.

3. **Start React** in another terminal:

   ```powershell
   cd client
   npm ci
   npm run dev
   ```

   Open `http://localhost:5173` and sign in as the Admin you provisioned. Vite proxies `/api` to port 5080 so the browser uses one origin throughout.

## Verify a change

Run `dotnet build server --configuration Release` from the root and `npm run build` from `client`. For integration coverage, start the API against a **disposable PostgreSQL database**, provision both roles, and set `RELAY_ADMIN_EMAIL`, `RELAY_ADMIN_PASSWORD`, `RELAY_USER_EMAIL` and `RELAY_USER_PASSWORD` in the test shell. Use PowerShell 7:

```powershell
pwsh -File ./tests/smoke.ps1
```

The test exercises anonymous and role-restricted requests, failed and valid sign-in, anti-forgery, input errors, project create/read/update/delete, literal search, summary counts and sign-out. It creates and removes a temporary project. An optional `-BaseUrl` overrides the API address.

## Adapt the starter

- Change the product name in `client/src/brand.ts` and the document title in `client/index.html`. Adjust the color tokens in `client/src/style.css`.
- Add navigation and routes in `client/src/main.tsx`. Its dashboard shell renders child pages through an outlet. Use `client/src/projects.tsx` for the list and editor pattern, and `client/src/api.ts` for same-origin API calls and error handling.
- Add a model to `server/AppDb.cs` and use `ProjectsController.cs` as the template for endpoints. Define an input DTO with validation, annotate access rules at the controller or action, and avoid binding input directly to tracked entities. Use response DTOs when entities have internal fields.
- With `ConnectionStrings__App` configured, use `dotnet tool restore` then `dotnet dotnet-ef migrations add YourChange --project server --output-dir Migrations`. Review generated SQL with `dotnet dotnet-ef migrations script --idempotent --project server`.

The browser session uses an HttpOnly Identity cookie. State-changing requests also need the token from `GET /api/auth/csrf`. The API enforces roles on the server; hidden controls only simplify the UI. Validation and HTTP errors use Problem Details. See Microsoft’s [cookie behavior for APIs](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/api-endpoint-auth?view=aspnetcore-10.0) and [anti-forgery guidance](https://learn.microsoft.com/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0).

## Publish on one origin

```powershell
Push-Location client
npm ci
npm run build
Pop-Location
New-Item -ItemType Directory -Force server/wwwroot | Out-Null
Copy-Item client/dist/* server/wwwroot -Recurse -Force
dotnet publish server -c Release -o ./publish
```

Use a clean `wwwroot` and publish directory for release builds. Host the API and bundled SPA together over HTTPS. Production sets secure cookies and enables HTTPS redirection and HSTS. For TLS termination at a reverse proxy, configure ASP.NET Core Forwarded Headers for that trusted proxy before HTTPS redirection, or terminate TLS in ASP.NET Core. Persist the ASP.NET Core Data Protection key ring across restarts; share it across replicas and isolate it per client. Configure runtime credentials with a secret store or environment variables. Apply database migrations and bootstrap accounts in a separate operator step before serving traffic; keep bootstrap credentials out of the running service.

The template shares all project records within one deployment. If you need tenant separation, account self-service, MFA or an organizational identity provider, add those deliberately for that deployment.
