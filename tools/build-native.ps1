param(
    [ValidateSet('host-test', 'ohos-arm64', 'ohos-x64')]
    [string]$Target = 'host-test',
    # debug: faster compile with debug symbols; release: thin LTO + strip, much smaller artifact.
    [ValidateSet('debug', 'release')]
    [string]$Profile = 'debug'
)

$ErrorActionPreference = 'Stop'
$Workspace = Split-Path -Parent $PSScriptRoot
$ReleaseArgs = @()
if ($Profile -eq 'release') { $ReleaseArgs = @('--release') }

# Mobile imports only consume summary counts, while upstream Anki keeps every
# imported field in its result log. Apply the tracked, idempotent patch before
# compiling so large APKG files do not retain and bridge a second full copy of
# all note text. third_party/ is intentionally gitignored and may be recloned.
$AnkiRoot = Join-Path $Workspace 'third_party\anki'
$AnkiPatch = Join-Path $Workspace 'tools\patches\anki-compact-import-log.patch'
if (-not (Test-Path $AnkiRoot)) {
    throw 'third_party\anki is missing; clone the Anki source before building native code.'
}
# Reverse-check failure is expected on pristine sources. PowerShell 5 must
# reach the forward check instead of treating native stderr as terminating.
try {
    $ErrorActionPreference = 'Continue'
    & git -C $Workspace apply --check --reverse --recount --ignore-space-change --ignore-whitespace `
        --directory=third_party/anki $AnkiPatch 2>$null
    $AnkiPatchAlreadyApplied = $LASTEXITCODE -eq 0
} finally {
    $ErrorActionPreference = 'Stop'
}
if (-not $AnkiPatchAlreadyApplied) {
    & git -C $Workspace apply --check --recount --ignore-space-change --ignore-whitespace `
        --directory=third_party/anki $AnkiPatch
    if ($LASTEXITCODE -ne 0) {
        throw 'Anki compact import-log patch does not apply to the current vendored source.'
    }
    & git -C $Workspace apply --recount --ignore-space-change --ignore-whitespace `
        --directory=third_party/anki $AnkiPatch
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to apply the Anki compact import-log patch.'
    }
}

# Toolchain resolution: prefer JIDECARDS_TOOLCHAINS env var; fall back to the
# bundled work\toolchains directory (offline toolchain shipped with the repo).
# If neither exists, enter "external mode" — assume rustup/protoc and Visual Studio/MSVC
# are already installed; do not override CARGO_HOME/RUSTUP_HOME/
# PROTOC. In external mode, OHOS targets additionally need JIDECARDS_MSVC_SYSROOT
# pointing to an xwin-generated MSVC sysroot (or leave unset after installing
# Visual Studio Build Tools so clang can auto-detect).
$BundledToolchains = Join-Path $Workspace 'work\toolchains'
if ($env:JIDECARDS_TOOLCHAINS -and (Test-Path $env:JIDECARDS_TOOLCHAINS)) {
    $Toolchains = $env:JIDECARDS_TOOLCHAINS
    $BundledMode = $false
} elseif (Test-Path $BundledToolchains) {
    $Toolchains = $BundledToolchains
    $BundledMode = $true
} else {
    $Toolchains = $null
    $BundledMode = $false
}

if ($Toolchains) {
    $env:CARGO_HOME = Join-Path $Toolchains 'cargo'
    $env:RUSTUP_HOME = Join-Path $Toolchains 'rustup'
    $env:PROTOC = Join-Path $Toolchains 'protoc-31.1\bin\protoc.exe'
    $CargoZig = Join-Path $Toolchains 'python\site\bin\cargo-zigbuild.exe'
    $CargoBin = Join-Path $env:CARGO_HOME 'bin'
} else {
    Write-Host '[build-native] using installed Rust/VS/protoc toolchain from PATH.'
    $CargoZig = 'cargo-zigbuild'
    $CargoBin = $null
}

if ($Target -eq 'host-test') {
    if ($Toolchains) {
        $env:RUSTUP_TOOLCHAIN = '1.92.0-x86_64-pc-windows-gnu'
        $ZigRoot = Get-ChildItem (Join-Path $Toolchains 'zig-tar') -Filter zig.exe -Recurse |
            Select-Object -First 1 -ExpandProperty DirectoryName
        $env:PATH = "$CargoBin;$ZigRoot;$($env:PATH)"
    } else {
        # 已安装 VS 的主机直接执行真实 Core 测试，不额外依赖 Zig/GNU 工具链。
        $env:RUSTUP_TOOLCHAIN = '1.92.0-x86_64-pc-windows-msvc'
    }
    & cargo fmt -p jidecards_core -- --check
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & cargo clippy -p jidecards_core -- -D warnings
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if ($Toolchains) {
        & $CargoZig test -p jidecards_core --features anki-core --target x86_64-pc-windows-gnu
    } else {
        & cargo test -p jidecards_core --features anki-core
    }
    exit $LASTEXITCODE
}

$DevEcoRoot = if ($env:DEVECO_HOME) { $env:DEVECO_HOME } else { 'C:\Program Files\Huawei\DevEco Studio' }
$NativeRoot = Join-Path $DevEcoRoot 'sdk\default\openharmony\native'
$env:RUSTUP_TOOLCHAIN = '1.92.0-x86_64-pc-windows-msvc'
if ($CargoBin) {
    $env:PATH = "$CargoBin;$NativeRoot\llvm\bin;$($env:PATH)"
} else {
    $env:PATH = "$NativeRoot\llvm\bin;$($env:PATH)"
}

# MSVC sysroot resolution: bundled mode uses work\toolchains\xwin-clang-cache;
# external mode uses JIDECARDS_MSVC_SYSROOT; if neither is set, assume Visual
# Studio Build Tools are installed and let clang auto-detect VC Tools paths.
if ($Toolchains -and (Test-Path (Join-Path $Toolchains 'xwin-clang-cache'))) {
    $MsvcSysroot = Join-Path $Toolchains 'xwin-clang-cache\windows-msvc-sysroot\windows-msvc-sysroot'
} elseif ($env:JIDECARDS_MSVC_SYSROOT) {
    $MsvcSysroot = $env:JIDECARDS_MSVC_SYSROOT
} else {
    $MsvcSysroot = $null
}

if ($MsvcSysroot) {
    $MsvcInclude = Join-Path $MsvcSysroot 'include'
    $MsvcLib = Join-Path $MsvcSysroot 'lib\x86_64-unknown-windows-msvc'
    $env:CFLAGS_x86_64_pc_windows_msvc = "--target=x86_64-windows-msvc -fuse-ld=lld-link -I$MsvcInclude -I$MsvcInclude\c++\stl -I$MsvcInclude\__msvc_vcruntime_intrinsics"
    $env:CXXFLAGS_x86_64_pc_windows_msvc = $env:CFLAGS_x86_64_pc_windows_msvc
    $env:LIB = $MsvcLib
}

$env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = Join-Path $NativeRoot 'llvm\bin\lld-link.exe'
$env:CC_x86_64_pc_windows_msvc = Join-Path $NativeRoot 'llvm\bin\clang.exe'
$env:CXX_x86_64_pc_windows_msvc = Join-Path $NativeRoot 'llvm\bin\clang++.exe'
$env:AR_x86_64_pc_windows_msvc = Join-Path $NativeRoot 'llvm\bin\llvm-lib.exe'
$env:JIDECARDS_OHOS_CLANG = Join-Path $NativeRoot 'llvm\bin\clang.exe'
$env:JIDECARDS_OHOS_SYSROOT = Join-Path $NativeRoot 'sysroot'
$LlvmAr = Join-Path $NativeRoot 'llvm\bin\llvm-ar.exe'

if ($CargoBin) {
    $Cargo = Join-Path $CargoBin 'cargo.exe'
} else {
    $Cargo = 'cargo'
}

if ($Target -eq 'ohos-arm64') {
    $env:CARGO_TARGET_AARCH64_UNKNOWN_LINUX_OHOS_LINKER = Join-Path $PSScriptRoot 'ohos-aarch64-clang.cmd'
    $env:CC_aarch64_unknown_linux_ohos = $env:CARGO_TARGET_AARCH64_UNKNOWN_LINUX_OHOS_LINKER
    $env:AR_aarch64_unknown_linux_ohos = $LlvmAr
    & $Cargo build -p jidecards_core --features anki-core --target aarch64-unknown-linux-ohos @ReleaseArgs
    exit $LASTEXITCODE
}

$env:CARGO_TARGET_X86_64_UNKNOWN_LINUX_OHOS_LINKER = Join-Path $PSScriptRoot 'ohos-x86_64-clang.cmd'
$env:CC_x86_64_unknown_linux_ohos = $env:CARGO_TARGET_X86_64_UNKNOWN_LINUX_OHOS_LINKER
$env:AR_x86_64_unknown_linux_ohos = $LlvmAr
& $Cargo build -p jidecards_core --features anki-core --target x86_64-unknown-linux-ohos @ReleaseArgs
exit $LASTEXITCODE
