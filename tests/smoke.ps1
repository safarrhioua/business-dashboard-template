#requires -Version 7.0
param([string]$BaseUrl = 'http://localhost:5080')
$ErrorActionPreference = 'Stop'
foreach ($key in 'RELAY_ADMIN_EMAIL','RELAY_ADMIN_PASSWORD','RELAY_USER_EMAIL','RELAY_USER_PASSWORD') {
  if (-not [Environment]::GetEnvironmentVariable($key)) { throw "Set $key before running the smoke test." }
}
$admin = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$user = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$guest = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
function Call($session, $method, $path, $expected, $data, [switch]$Csrf) {
  $headers = @{ Accept = 'application/json, application/problem+json' }
  if ($Csrf) { $headers['X-CSRF-Token'] = (Call $session GET '/auth/csrf' 200).token }
  $options = @{ Uri = "$BaseUrl/api$path"; Method = $method; Headers = $headers; WebSession = $session;
    SkipHttpErrorCheck = $true; TimeoutSec = 15 }
  if ($null -ne $data) { $options.Body = ConvertTo-Json -InputObject $data -Compress; $options.ContentType = 'application/json' }
  $response = Invoke-WebRequest @options
  if ([int]$response.StatusCode -ne $expected) { throw "$method $path returned $($response.StatusCode); expected $expected. $($response.Content)" }
  if ($response.Content) { [Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray()) | ConvertFrom-Json }
}
function Check($condition, $label) { if (-not $condition) { throw $label } }

$id = $null
try {
  $null = Call $guest GET '/projects' 401
  $null = Call $guest GET '/does-not-exist' 404
  $login = @{ email = $env:RELAY_ADMIN_EMAIL; password = $env:RELAY_ADMIN_PASSWORD }
  $null = Call $admin POST '/auth/login' 400 $login
  $null = Call $admin POST '/auth/login' 401 @{ email = $login.email; password = 'Intentionally wrong' } -Csrf
  $null = Call $admin POST '/auth/login' 204 $login -Csrf
  Check ('Admin' -in (Call $admin GET '/auth/me' 200).roles) 'Admin role missing.'
  $null = Call $user POST '/auth/login' 204 @{ email = $env:RELAY_USER_EMAIL; password = $env:RELAY_USER_PASSWORD } -Csrf
  Check ('User' -in (Call $user GET '/auth/me' 200).roles) 'User role missing.'

  $name = 'Smoke ' + [guid]::NewGuid().ToString('N') + ' %_'
  $inputProject = @{ name = " $name "; client = 'Smoke client'; status = 'Planned' }
  $null = Call $user POST '/projects' 403 $inputProject -Csrf
  $null = Call $admin POST '/projects' 400 $inputProject
  $validation = Call $admin POST '/projects' 400 @{ name = '  '; client = ''; status = 'Planned' } -Csrf
  Check ($validation.errors.Name -and $validation.errors.Client) ("Field validation details missing: " + ($validation | ConvertTo-Json -Compress -Depth 5))
  $null = Call $admin POST '/projects' 400 @{ name = 'Invalid'; client = 'Invalid'; status = 1 } -Csrf
  $project = Call $admin POST '/projects' 201 $inputProject -Csrf
  $id = $project.id
  Check ($project.name -ceq $name) 'Name was not trimmed.'
  Check ((Call $user GET "/projects/$id" 200).id -eq $id) 'User could not read the project.'
  $search = [Uri]::EscapeDataString($name.ToLowerInvariant())
  $match = Call $user GET "/projects?search=$search" 200
  Check ($match.total -eq 1 -and $match.items[0].id -eq $id) 'Case-insensitive literal search failed.'
  $null = Call $user GET '/projects?page=0' 400
  $before = Call $user GET '/projects/summary' 200
  $inputProject.status = 'Active'
  $null = Call $user PUT "/projects/$id" 403 $inputProject -Csrf
  $null = Call $user DELETE "/projects/$id" 403 -Csrf
  Check ((Call $admin PUT "/projects/$id" 200 $inputProject -Csrf).status -ceq 'Active') 'Update did not return the new status.'
  Check ((Call $user GET '/projects/summary' 200).active -eq ($before.active + 1)) 'Summary did not reflect the update.'
  $null = Call $admin DELETE "/projects/$id" 204 -Csrf
  $null = Call $user GET "/projects/$id" 404
  $null = Call $admin DELETE "/projects/$id" 404 -Csrf
  $id = $null
  $null = Call $admin POST '/auth/logout' 204 -Csrf
  $null = Call $admin GET '/auth/me' 401
  Write-Host 'PASS: Identity sessions, roles, CSRF, validation, project CRUD, search, summary and logout.'
} finally {
  if ($null -ne $id) { try { $null = Call $admin DELETE "/projects/$id" 204 -Csrf } catch { Write-Warning "Could not remove smoke project $id." } }
}

