<#
.SYNOPSIS
  Run every offline check for the RTL Smart Patcher plugin.

.DESCRIPTION
  Two checkers run without a browser or a running app:

    validate-bundle.mjs  reads the package manifest, the icon, the locales, and
                         the Loader patch exactly as the host does
    client-smoke-test.mjs  drives the shipped browser bundle against a stub DOM

  Node is taken from the DeepSeek Harness runtime when it is installed, so this
  works on a machine with no Node installation of its own.

.EXAMPLE
  .\test.ps1
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }

$node = $null
foreach ($candidate in @(
        (Join-Path $HOME '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe')
    )) {
    if (Test-Path -LiteralPath $candidate) { $node = $candidate; break }
}
if (-not $node) {
    $onPath = Get-Command node -ErrorAction SilentlyContinue
    if ($onPath) { $node = $onPath.Source }
}
if (-not $node) { throw 'no node runtime found: install DeepSeek Harness, or put node on PATH' }

Write-Host "node: $node" -ForegroundColor DarkGray

$failed = $false
foreach ($check in @(
        @{ Label = 'bundle validation'; Script = 'dsh-rtl-smart-patcher-install\tools\validate-bundle.mjs'; Argument = 'dsh-rtl-smart-patcher' },
        @{ Label = 'client smoke test'; Script = 'dsh-rtl-smart-patcher-install\tools\client-smoke-test.mjs'; Argument = $null }
    )) {
    Write-Host ''
    Write-Host "── $($check.Label) " -ForegroundColor Cyan
    $arguments = @((Join-Path $root $check.Script))
    if ($check.Argument) { $arguments += (Join-Path $root $check.Argument) }
    & $node @arguments
    if ($LASTEXITCODE -ne 0) { $failed = $true }
}

Write-Host ''
if ($failed) {
    Write-Host 'CHECKS FAILED' -ForegroundColor Red
    exit 1
}
Write-Host 'ALL CHECKS PASSED' -ForegroundColor Green
