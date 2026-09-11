<#
.SYNOPSIS
    Start everything StudentWise needs locally, with no windows to keep open.

.DESCRIPTION
    Postgres, the API and the dev server all run hidden; their output goes to
    logs/ instead of to a console you have to leave sitting there.

    Two things worth knowing before you use this.

    The API still runs on this machine. A browser cannot talk to the database
    directly, so something has to serve /api -- hiding the window changes where
    the output goes, not whether the process exists. The way to genuinely stop
    running it here is to deploy it (missions 10.1-10.3), after which the phone
    works from anywhere rather than only on this Wi-Fi.

    Nothing here reloads on a code change. The reload worker is a separate
    process that survives its parent, and an orphan of it once sat on port 8000
    for nineteen hours serving a build of the API that no longer existed, which
    is a much worse afternoon than restarting by hand. Run dev-down.ps1 and
    dev-up.ps1 after changing Python.

.PARAMETER Lan
    Bind the dev server to every interface so a phone on the same Wi-Fi can
    reach it. Off by default: a dev server on the LAN is a dev server anyone on
    the LAN can use.

.EXAMPLE
    .\scripts\dev-up.ps1
    .\scripts\dev-up.ps1 -Lan
#>
[CmdletBinding()]
param(
    [switch]$Lan
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $root 'logs'
$venv = Join-Path $root 'backend\.venv\Scripts\python.exe'

if (-not (Test-Path $venv)) {
    throw "No virtualenv at $venv. Run: cd backend; py -3.12 -m venv .venv; .\.venv\Scripts\pip install -r requirements.txt"
}
if (-not (Test-Path $logs)) { New-Item -ItemType Directory -Path $logs | Out-Null }

function Test-Port([int]$Port) {
    $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

# --- Postgres --------------------------------------------------------------
# Port 5434 on the host, so it cannot collide with a Postgres someone already
# has on 5432.
if (Test-Port 5434) {
    Write-Host 'postgres  already up on 5434'
} else {
    Write-Host 'postgres  starting...' -NoNewline
    Push-Location $root
    try { docker compose up -d 2>&1 | Out-Null } catch { } finally { Pop-Location }

    # Check the port rather than trust the exit code. `docker compose up` fails
    # in a way that still looks like output, and a script that announces
    # "postgres up" while the database is not listening sends you looking for
    # the bug in the API instead.
    foreach ($i in 1..20) { Start-Sleep -Milliseconds 500; if (Test-Port 5434) { break } }
    if (Test-Port 5434) {
        Write-Host ' up on 5434'
    } else {
        Write-Host ' FAILED' -ForegroundColor Red
        Write-Host '          Nothing is listening on 5434. The usual cause is that Docker' -ForegroundColor Red
        Write-Host '          Desktop is not running -- start it and run this again. The API' -ForegroundColor Red
        Write-Host '          will start regardless and answer /health, because /health does' -ForegroundColor Red
        Write-Host '          not touch the database; every real request will fail.' -ForegroundColor Red
    }
}

# --- API -------------------------------------------------------------------
if (Test-Port 8000) {
    Write-Host 'api       already up on 8000'
} else {
    Write-Host 'api       starting...' -NoNewline
    Start-Process -FilePath $venv `
        -ArgumentList '-m', 'uvicorn', 'app.main:app', '--port', '8000' `
        -WorkingDirectory (Join-Path $root 'backend') `
        -RedirectStandardOutput (Join-Path $logs 'api.log') `
        -RedirectStandardError (Join-Path $logs 'api.err.log') `
        -WindowStyle Hidden | Out-Null

    $ready = $false
    foreach ($i in 1..25) {
        Start-Sleep -Milliseconds 400
        try {
            $r = Invoke-WebRequest 'http://127.0.0.1:8000/health' -TimeoutSec 2 -UseBasicParsing
            if ($r.StatusCode -eq 200) { $ready = $true; break }
        } catch { }
    }
    if ($ready) { Write-Host ' up on 8000' }
    else { Write-Host " did NOT answer /health -- see $logs\api.err.log" -ForegroundColor Red }
}

# --- Dev server ------------------------------------------------------------
if (Test-Port 5173) {
    Write-Host 'frontend  already up on 5173'
} else {
    $script = if ($Lan) { 'dev:lan' } else { 'dev' }
    Write-Host "frontend  starting ($script)..." -NoNewline
    Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/c', "npm run $script > `"$logs\frontend.log`" 2>&1" `
        -WorkingDirectory (Join-Path $root 'frontend') `
        -WindowStyle Hidden | Out-Null

    foreach ($i in 1..30) { Start-Sleep -Milliseconds 400; if (Test-Port 5173) { break } }
    if (Test-Port 5173) { Write-Host ' up on 5173' }
    else { Write-Host " did NOT bind 5173 -- see $logs\frontend.log" -ForegroundColor Red }
}

Write-Host ''
Write-Host '  app   http://localhost:5173'
Write-Host '  api   http://localhost:8000/docs'
if ($Lan) {
    $ip = (Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway }).IPv4Address.IPAddress | Select-Object -First 1
    if ($ip) { Write-Host "  phone http://${ip}:5173   (same Wi-Fi; allow inbound 5173 if it does not load)" }
}
Write-Host ''
Write-Host "  logs  $logs"
Write-Host '  stop  .\scripts\dev-down.ps1'
