# One-pass keeper for the local n8n staging (MASTER-PROMPT 0.3 #7). Idempotent; run at logon and every 10 min.
#   1. Docker engine up (clears stale AF_UNIX socket dirs that crash Docker Desktop 4.61 on this laptop)
#   2. n8n + Postgres containers up
#   3. cloudflared quick tunnel alive; if its URL changed, rewrite N8N_PUBLIC_URL / WEBHOOK_URL in .env and recreate n8n
# ASCII only: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.
$ErrorActionPreference = 'Continue'
$repo    = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $repo '.env'
$compose = Join-Path $PSScriptRoot 'docker-compose.yml'
$state   = Join-Path $env:LOCALAPPDATA 'lv-n8n'
$tlog    = Join-Path $state 'tunnel.log'
$log     = Join-Path $state 'tick.log'
New-Item -ItemType Directory -Force $state | Out-Null
function Log($m) { "$(Get-Date -Format s) $m" | Add-Content $log }

function Test-Engine { $v = docker info --format '{{.ServerVersion}}' 2>$null; return [bool]$v }

# 1. Docker
if (-not (Test-Engine)) {
    Log 'docker engine down - restarting Docker Desktop'
    Get-Process 'Docker Desktop', 'com.docker.*' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep 3
    $ts = Get-Date -Format yyyyMMddHHmmss
    foreach ($d in @("$env:LOCALAPPDATA\Docker\run", "$env:LOCALAPPDATA\docker-secrets-engine")) {
        if (Get-ChildItem $d -Force -File -Attributes ReparsePoint -ErrorAction SilentlyContinue) {
            Rename-Item $d "$(Split-Path $d -Leaf).stale-$ts" -ErrorAction SilentlyContinue
            Log "moved stale socket dir $d"
        }
    }
    Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    for ($i = 0; $i -lt 36 -and -not (Test-Engine); $i++) { Start-Sleep 5 }
    if (-not (Test-Engine)) { Log 'docker engine still down after 3 min - giving up this tick'; exit 1 }
    Log 'docker engine up'
}

# 2. Containers (restart: unless-stopped keeps them up once created)
docker compose -f $compose up -d 2>&1 | Out-Null

# 3. Tunnel
function Get-TunnelUrl {
    $m = Select-String -Path $tlog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -Last 1
    if ($m) { return $m.Matches[0].Value }
}
function Test-Url($u) {
    try { return (Invoke-WebRequest "$u/healthz" -UseBasicParsing -TimeoutSec 15).StatusCode -eq 200 } catch { return $false }
}
# Judge the tunnel only once n8n itself answers - a 502 while n8n boots must not rotate the URL
for ($i = 0; $i -lt 24 -and -not (Test-Url 'http://localhost:5678'); $i++) { Start-Sleep 5 }
if (-not (Test-Url 'http://localhost:5678')) { Log 'n8n not healthy locally - leaving tunnel alone this tick'; exit 1 }
$tunnelProc = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object { $_.CommandLine -match 'localhost:5678' }
$url = Get-TunnelUrl
if (-not $tunnelProc -or -not $url -or -not (Test-Url $url)) {
    Log 'tunnel down or unreachable - restarting'
    $tunnelProc | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Remove-Item $tlog -ErrorAction SilentlyContinue
    Start-Process cloudflared -ArgumentList 'tunnel', '--no-autoupdate', '--url', 'http://localhost:5678', '--logfile', $tlog -WindowStyle Hidden
    $url = $null
    for ($i = 0; $i -lt 30 -and -not $url; $i++) { Start-Sleep 2; $url = Get-TunnelUrl }
    if (-not $url) { Log 'tunnel gave no URL'; exit 1 }
}

# Keep .env in step with the live tunnel URL
$lines = Get-Content $envFile
$current = ($lines | Where-Object { $_ -like 'N8N_PUBLIC_URL=*' }) -replace '^N8N_PUBLIC_URL=', ''
if ($current -ne $url) {
    $lines = $lines | ForEach-Object { $_ -replace '^N8N_PUBLIC_URL=.*', "N8N_PUBLIC_URL=$url" -replace '^WEBHOOK_URL=.*', "WEBHOOK_URL=$url/" }
    [IO.File]::WriteAllLines($envFile, $lines)
    docker compose -f $compose up -d --force-recreate n8n 2>&1 | Out-Null
    Log "tunnel URL changed -> $url (n8n recreated)"
}
Set-Content (Join-Path $state 'url.txt') $url
