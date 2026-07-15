$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$Port = 3000
$Url = "http://127.0.0.1:$Port"
$ServerJs = Join-Path $PSScriptRoot "server.js"

Write-Host ""
Write-Host "========================================"
Write-Host "  Group Template AI - Start"
Write-Host "========================================"
Write-Host "Project: $PWD"
Write-Host ""

if (-not (Test-Path -LiteralPath $ServerJs)) {
  Write-Host "[ERROR] server.js not found: $ServerJs" -ForegroundColor Red
  Read-Host "Press Enter to exit"
  exit 1
}

$nodeExe = $null
$cmd = Get-Command node -ErrorAction SilentlyContinue
if ($cmd) { $nodeExe = $cmd.Source }

if (-not $nodeExe) {
  $candidates = @(
    "$env:ProgramFiles\nodejs\node.exe",
    "${env:ProgramFiles(x86)}\nodejs\node.exe",
    "$env:LOCALAPPDATA\Programs\node\node.exe"
  )
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath $c) { $nodeExe = $c; break }
  }
}

if (-not $nodeExe) {
  Write-Host "[ERROR] Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
  Write-Host "Tip: enable Add to PATH, then reopen this script."
  Read-Host "Press Enter to exit"
  exit 1
}

Write-Host "Using: $nodeExe"
& $nodeExe -v
Write-Host ""

$busy = $false
try {
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($conn) { $busy = $true }
} catch {}
if (-not $busy) {
  $lines = netstat -ano | Select-String ":$Port\s+.*LISTENING"
  if ($lines) { $busy = $true }
}

if ($busy) {
  Write-Host "[INFO] Port $Port already in use. Opening browser..."
  Start-Process $Url
  Read-Host "Press Enter to exit"
  exit 0
}

Write-Host "Starting server at $Url"
Write-Host "Keep this window open. Press Ctrl+C to stop."
Write-Host ""

Start-Process $Url
Start-Sleep -Milliseconds 300

& $nodeExe $ServerJs
$code = $LASTEXITCODE
if ($code -ne 0) {
  Write-Host "[ERROR] Server exited with code $code" -ForegroundColor Red
  Read-Host "Press Enter to exit"
  exit $code
}
