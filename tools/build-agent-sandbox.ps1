param(
    [string]$WasiSdk = '',
    [ValidateSet('host', 'ohos', 'app', 'all')]
    [string]$Target = 'all',
    [switch]$RebuildEngine
)

$ErrorActionPreference = 'Stop'
$Workspace = Split-Path -Parent $PSScriptRoot
$Prototype = Join-Path $Workspace 'native/agent-sandbox'
$Source = Join-Path $Workspace 'work/sandbox/quickjs'
$Commit = '6d46d07d04041b40f4f49eaa7fdebe44c314c699'
if (-not $WasiSdk) { $WasiSdk = Join-Path $Workspace 'work/sandbox/wasi-sdk-20.0+m' }
$Clang = Join-Path $WasiSdk 'bin/clang.exe'

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed: $LASTEXITCODE" }
}

Push-Location $Workspace
try {
    if ($RebuildEngine) {
    if (-not (Test-Path $Clang)) { throw "WASI SDK 20 missing: $Clang. See native/agent-sandbox/README.md." }
    if (-not (Test-Path $Source)) {
        Invoke-Checked git @('clone', '--depth', '1', '--branch', 'v0.17.0', 'https://github.com/quickjs-ng/quickjs.git', $Source)
    }
    $Actual = & git -C $Source rev-parse HEAD
    if ($LASTEXITCODE -ne 0 -or $Actual -ne $Commit) { throw 'QuickJS checkout does not match the pinned commit.' }
    $Dirty = & git -C $Source status --porcelain --untracked-files=all
    if ($LASTEXITCODE -ne 0 -or $Dirty) { throw 'QuickJS checkout must be clean.' }
    New-Item -ItemType Directory -Force -Path (Join-Path $Prototype 'target') | Out-Null
    $Wasm = Join-Path $Prototype 'target/quickjs.wasm'
    $CompilerArgs = @('--target=wasm32-wasi', "--sysroot=$WasiSdk/share/wasi-sysroot", '-O2', '-flto',
        '-D_GNU_SOURCE', '-DNDEBUG', '-mexec-model=reactor', '-fno-exceptions',
        '-Wl,-z,stack-size=2097152', '-Wl,--max-memory=33554432', '-Wl,--strip-all',
        '-I', $Source, (Join-Path $Prototype 'guest.c'))
    foreach ($File in @('quickjs.c', 'dtoa.c', 'libregexp.c', 'libunicode.c')) { $CompilerArgs += Join-Path $Source $File }
    $CompilerArgs += @('-lm', '-o', $Wasm)
    Invoke-Checked $Clang $CompilerArgs
    $Hasher = [System.Security.Cryptography.SHA256]::Create()
    $WasmStream = [System.IO.File]::OpenRead($Wasm)
    try {
        $WasmHash = [BitConverter]::ToString($Hasher.ComputeHash($WasmStream)).Replace('-', '').ToLowerInvariant()
        Write-Host "[sandbox] wasm_sha256=$WasmHash"
    } finally { $WasmStream.Dispose(); $Hasher.Dispose() }
    $PinnedHash = ([System.IO.File]::ReadAllLines((Join-Path $Prototype 'engine/SHA256SUMS'))[0] -split ' ')[0]
    if ($WasmHash -ne $PinnedHash) { throw 'Rebuilt engine differs from the checked-in artifact. Review provenance before updating it.' }
    }
    $Manifest = Join-Path $Prototype 'Cargo.toml'
    if ($Target -in @('host', 'all')) {
        Invoke-Checked cargo @('fmt', '--manifest-path', $Manifest, '--', '--check')
        Invoke-Checked cargo @('clippy', '--manifest-path', $Manifest, '--locked', '--all-targets', '--', '-D', 'warnings')
        Invoke-Checked cargo @('test', '--manifest-path', $Manifest, '--locked', '--release')
        Invoke-Checked cargo @('run', '--manifest-path', $Manifest, '--locked', '--release', '--example', 'probe')
    }
    if ($Target -in @('ohos', 'app', 'all')) {
        $DevEco = if ($env:DEVECO_HOME) { $env:DEVECO_HOME } else { 'C:\Program Files\Huawei\DevEco Studio' }
        $Native = Join-Path $DevEco 'sdk/default/openharmony/native'
        $env:JIDECARDS_OHOS_CLANG = Join-Path $Native 'llvm/bin/clang.exe'
        $env:JIDECARDS_OHOS_SYSROOT = Join-Path $Native 'sysroot'
        $env:CARGO_TARGET_AARCH64_UNKNOWN_LINUX_OHOS_LINKER = Join-Path $PSScriptRoot 'ohos-aarch64-clang.cmd'
        $env:CARGO_TARGET_X86_64_UNKNOWN_LINUX_OHOS_LINKER = Join-Path $PSScriptRoot 'ohos-x86_64-clang.cmd'
        foreach ($Arch in @('aarch64-unknown-linux-ohos', 'x86_64-unknown-linux-ohos')) {
            Invoke-Checked cargo @('build', '--manifest-path', $Manifest, '--locked', '--release', '--lib', '--target', $Arch)
            if ($Target -eq 'app') { continue }
            Invoke-Checked cargo @('build', '--manifest-path', $Manifest, '--locked', '--release', '--example', 'probe', '--target', $Arch)
            Invoke-Checked cargo @('test', '--manifest-path', $Manifest, '--locked', '--release', '--test', 'runtime', '--no-run', '--target', $Arch)
        }
    }
} finally { Pop-Location }
