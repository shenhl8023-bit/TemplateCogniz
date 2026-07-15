$ErrorActionPreference = "Continue"
$Port = 3000
Write-Host ""
Write-Host "========================================"
Write-Host "  Group Template AI - Stop"
Write-Host "========================================"
Write-Host "Looking for process on port $Port ..."
Write-Host ""

$pids = @()
try {
  $pids = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique)
} catch {}

if (-not $pids -or $pids.Count -eq 0) {
  $matches = netstat -ano | Select-String ":$Port\s+.*LISTENING"
  foreach ($m in $matches) {
    $parts = @(($m.Line -split "\s+") | Where-Object { $_ -ne "" })
    if ($parts.Count -ge 5) {
      $pids += [int]$parts[-1]
    }
  }
  $pids = @($pids | Select-Object -Unique)
}

if (-not $pids -or $pids.Count -eq 0) {
  Write-Host "No process listening on port $Port."
} else {
  foreach ($procId in $pids) {
    Write-Host "Killing PID $procId ..."
    try {
      Stop-Process -Id $procId -Force -ErrorAction Stop
      Write-Host "Stopped PID $procId"
    } catch {
      Write-Host "[WARN] Failed to stop PID $procId"
    }
  }
  Write-Host "Done."
}

Write-Host ""
Read-Host "Press Enter to exit"
