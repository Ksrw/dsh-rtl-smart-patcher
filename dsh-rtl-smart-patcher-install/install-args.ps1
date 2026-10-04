# RTL Smart Patcher launcher for DeepSeek Harness — parameter form.
#
# `install.ps1` deliberately has no param() block, because Windows PowerShell 5.1
# cannot parse one out of piped input and the published one-line install relies
# on exactly that. Calling scripts pass their options through here instead, which
# keeps a single implementation.
#
# Parameters:
#   -ProfileName <name>   profile to install into (default from $env:DSH_PROFILE, else 'desktop')
#   -ProfileDir  <dir>    full profile directory, overriding -ProfileName
#   -Source      <dir>    directory that already contains the plugin payload
#   -Repo        <spec>   GitHub 'owner/name' or 'owner/name@ref'
#   -Ref         <ref>    branch, tag, or commit
#   -Restore              remove the plugin
#   -DryRun               report the planned changes without writing anything
[CmdletBinding()]
param(
    [string] $ProfileName,
    [string] $ProfileDir,
    [string] $Source,
    [string] $Repo,
    [string] $Ref,
    [switch] $Restore,
    [switch] $DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$here = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$installer = Join-Path $here 'install.ps1'
if (-not (Test-Path -LiteralPath $installer)) {
    throw "install.ps1 is missing beside this launcher: $installer"
}

# Only the values the caller supplied are exported; install.ps1 falls back to
# DSH_RTL_REPO and DSH_RTL_REF defaults for the rest.
if ($ProfileName) { $env:DSH_RTL_PROFILE_NAME = $ProfileName }
if ($ProfileDir) { $env:DSH_RTL_PROFILE_DIR = $ProfileDir }
if ($Source) { $env:DSH_RTL_SOURCE = $Source }
if ($Repo) { $env:DSH_RTL_REPO = $Repo }
if ($Ref) { $env:DSH_RTL_REF = $Ref }
if ($Restore) { $env:DSH_RTL_RESTORE = '1' }
if ($DryRun) { $env:DSH_RTL_DRY_RUN = '1' }

# Dot-sourcing runs install.ps1 with no parameter binding, which is the same path
# the piped install takes.
. $installer
