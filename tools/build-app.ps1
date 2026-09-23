param(
    [ValidateSet('all', 'arm64', 'x64')]
    [string]$Architecture = 'all',
    # release 会同时让 Rust 走 --release（thin LTO + strip）并让 hvigor 走 release 构建模式。
    [ValidateSet('debug', 'release')]
    [string]$BuildMode = 'debug',
    [switch]$SkipRust,
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$Workspace = Split-Path -Parent $PSScriptRoot
$BuildLog = Join-Path $Workspace '.hvigor\last-build.log'
$WarningReport = Join-Path $Workspace '.hvigor\build-warning-report.json'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $BuildLog) | Out-Null
$Utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($BuildLog, '', $Utf8)
[System.IO.File]::WriteAllText($WarningReport, '{"status":"not-run"}', $Utf8)
& node (Join-Path $PSScriptRoot 'check-signing.mjs')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$DevEcoRoot = if ($env:DEVECO_HOME) { $env:DEVECO_HOME } else { 'C:\Program Files\Huawei\DevEco Studio' }
$env:DEVECO_SDK_HOME = Join-Path $DevEcoRoot 'sdk'
$env:JAVA_HOME = Join-Path $DevEcoRoot 'jbr'
$env:PATH = "$(Join-Path $env:JAVA_HOME 'bin');$($env:PATH)"

if (-not $SkipRust) {
    if ($Architecture -in @('all', 'arm64')) {
        & (Join-Path $PSScriptRoot 'build-native.ps1') -Target ohos-arm64 -Profile $BuildMode
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    if ($Architecture -in @('all', 'x64')) {
        & (Join-Path $PSScriptRoot 'build-native.ps1') -Target ohos-x64 -Profile $BuildMode
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
}

$Ohpm = Join-Path $DevEcoRoot 'tools\ohpm\bin\ohpm.bat'
$Hvigor = Join-Path $DevEcoRoot 'tools\hvigor\bin\hvigorw.bat'
& $Ohpm install --all
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Windows PowerShell 5 wraps redirected native stderr in error records.
# Hvigor warnings must not abort this pipeline; inspect its exit code instead.
# PowerShell unwraps a one-item array produced by an assignment.  Passing that
# scalar with @BuildTasks makes native argument expansion treat the task name as
# an enumerable string ("assembleHap" becomes eight arguments).  Build the
# argument array incrementally so the native Hvigor invocation always receives
# whole task names.
$BuildTasks = @()
if ($Clean) {
    $BuildTasks += 'clean'
}
$BuildTasks += 'assembleHap'
try {
    $ErrorActionPreference = 'Continue'
    & $Hvigor --mode module -p product=default -p module=entry@default `
        -p buildMode=$BuildMode @BuildTasks --no-daemon 2>&1 | Tee-Object -Variable BuildOutput
    $HvigorExitCode = $LASTEXITCODE
    [System.IO.File]::WriteAllLines($BuildLog, [string[]]($BuildOutput | ForEach-Object { $_.ToString() }),
        $Utf8)
} finally {
    $ErrorActionPreference = 'Stop'
}
if ($HvigorExitCode -ne 0) { exit $HvigorExitCode }
$SignedHap = Join-Path $Workspace 'entry\build\default\outputs\default\entry-default-signed.hap'
if (($BuildOutput -match 'No signingConfig found') -or -not (Test-Path -LiteralPath $SignedHap -PathType Leaf)) {
    throw 'Signed HAP was not produced. Check the local signing configuration and Hvigor hook.'
}
$WarningArgs = @($BuildLog)
if ($Clean) { $WarningArgs += '--require-clean' }
& node (Join-Path $PSScriptRoot 'verify-build-warnings.mjs') @WarningArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
exit 0
