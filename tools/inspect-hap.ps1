$ErrorActionPreference = 'Stop'
$hap = 'entry\build\default\outputs\default\entry-default-signed.hap'
if (-not (Test-Path $hap)) { Write-Host 'HAP not found'; exit 1 }

$hapItem = Get-Item $hap
Write-Host ('HAP size: {0:N2} MB ({1} bytes)' -f ($hapItem.Length/1MB), $hapItem.Length)
Write-Host ''

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $hap))
Write-Host 'Top 25 entries by size:'
$zip.Entries | Sort-Object Length -Descending | Select-Object -First 25 | ForEach-Object {
    Write-Host ('  {0,12:N0}  {1}' -f $_.Length, $_.FullName)
}
Write-Host ''
$total = ($zip.Entries | Measure-Object -Property Length -Sum).Sum
Write-Host ('Uncompressed total: {0:N2} MB' -f ($total/1MB))
$zip.Dispose()
