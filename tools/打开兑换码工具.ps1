$ErrorActionPreference = 'Stop'
$sessionPath = Join-Path $env:USERPROFILE '.jidecards-issuer\ui-session.json'
function Get-IssuerSession {
    if (-not (Test-Path -LiteralPath $sessionPath)) { return $null }
    try {
        $session = Get-Content -LiteralPath $sessionPath -Raw | ConvertFrom-Json
        $health = Invoke-RestMethod -Uri "$($session.origin)/health" -TimeoutSec 2
        if ($health.instance -eq $session.instance) { return $session }
    } catch { }
    return $null
}
try {
    $session = Get-IssuerSession
    if ($null -eq $session) {
        $nodePath = (Get-Command node -ErrorAction Stop).Source
        $scriptPath = Join-Path $PSScriptRoot 'redemption-ui.mjs'
        Start-Process -FilePath $nodePath -ArgumentList ('"' + $scriptPath + '"') -WindowStyle Hidden
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            Start-Sleep -Milliseconds 200
            $session = Get-IssuerSession
            if ($null -ne $session) { break }
        }
    }
    if ($null -eq $session) { throw '工具无法启动，请检查 Node.js 和发行私钥是否存在。' }
    Start-Process "$($session.origin)/#$($session.token)"
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Jidecards 兑换码工具') | Out-Null
}
