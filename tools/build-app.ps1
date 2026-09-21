param(
    [ValidateSet('all', 'arm64', 'x64')]
    [string]$Architecture = 'all',
    # release 会同时让 Rust 走 --release（thin LTO + strip）并让 hvigor 走 release 构建模式。
    [ValidateSet('debug', 'release')]
    [string]$BuildMode = 'debug',
    [switch]$SkipRust
)

$ErrorActionPreference = 'Stop'
$Workspace = Split-Path -Parent $PSScriptRoot
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
try {
    $ErrorActionPreference = 'Continue'
    & $Hvigor --mode module -p product=default -p module=entry@default `
        -p buildMode=$BuildMode assembleHap --no-daemon 2>&1 | Tee-Object -Variable BuildOutput
    $HvigorExitCode = $LASTEXITCODE
} finally {
    $ErrorActionPreference = 'Stop'
}
if ($HvigorExitCode -ne 0) { exit $HvigorExitCode }
$SignedHap = Join-Path $Workspace 'entry\build\default\outputs\default\entry-default-signed.hap'
if (($BuildOutput -match 'No signingConfig found') -or -not (Test-Path -LiteralPath $SignedHap -PathType Leaf)) {
    throw 'Signed HAP was not produced. Check the local signing configuration and Hvigor hook.'
}
exit 0
