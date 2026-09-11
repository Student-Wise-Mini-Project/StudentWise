<#
.SYNOPSIS
    Stop whatever dev-up.ps1 started.

.DESCRIPTION
    The reason this script exists rather than "just close the window": once the
    processes are hidden there is no window to close, and a hidden server you
    have forgotten about is worse than a visible one. Stopping them has to be as
    easy as starting them.

    It kills by port rather than by name, and it kills the whole process tree of
    whatever holds the port. That second part matters: uvicorn's --reload worker
    and npm's node child are both spawned processes that keep the listening
    socket when their parent dies, and an orphan holding port 8000 while serving
    a stale build of the API is genuinely hard to diagnose -- the command line
    of uvicorn's worker does not even contain the word "uvicorn".

    Postgres is left running by default. It is a container, it costs nothing
    idle, and the next dev-up.ps1 is faster for it being up.

.PARAMETER IncludeDatabase
    Also stop the Postgres container.

.EXAMPLE
    .\scripts\dev-down.ps1
    .\scripts\dev-down.ps1 -IncludeDatabase
#>
[CmdletBinding()]
param(
    [switch]$IncludeDatabase
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Stop-Tree([int]$ProcessId) {
    # Children first: a parent killed on its own leaves the child holding the socket.
    Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Tree $_.ProcessId }
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Stop-Port([int]$Port, [string]$Label) {
    $owners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    if (-not $owners) {
        Write-Host "$Label  not running"
        return
    }
    foreach ($owner in $owners) {
        # Walk up to the top of the tree, so killing a worker does not leave its
        # parent to respawn one.
        $current = $owner
        while ($true) {
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$current" -ErrorAction SilentlyContinue
            if (-not $proc) { break }
            $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.ParentProcessId)" -ErrorAction SilentlyContinue
            if (-not $parent -or $parent.Name -notmatch '^(python|node|cmd)\.exe$') { break }
            $current = $proc.ParentProcessId
        }
        Stop-Tree $current
    }
    Start-Sleep -Milliseconds 700
    $still = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($still) { Write-Host "$Label  STILL holding $Port" -ForegroundColor Red }
    else { Write-Host "$Label  stopped" }
}

Stop-Port 5173 'frontend'
Stop-Port 8000 'api     '

if ($IncludeDatabase) {
    Push-Location $root
    try { docker compose down | Out-Null } finally { Pop-Location }
    Write-Host 'postgres  stopped'
} else {
    Write-Host 'postgres  left running (use -IncludeDatabase to stop it too)'
}
