# RTL Smart Patcher installer for DeepSeek Harness.
#
# Install, update, or remove the plugin. The desktop app owns its own profile
# ($DSH_HOME\profiles\desktop) and keeps it closed to the `dsh` command line, so
# this script performs exactly the two edits that profile's own plugin manager
# performs for a local bundle:
#
#   1. copy the plugin package into
#      <profile>\node_modules\dsh-rtl-smart-patcher
#   2. add that package to the profile's `dependencies` and to
#      `dsh.profile.bundles` in <profile>\package.json
#
# Nothing else is written: the profile's cordis.patch.yml belongs to the user and
# to the app's plugin manager, and this bundle carries its own patch layer.
#
# It runs in two shapes and behaves the same in both:
#
#   * as a file, with parameters:
#       .\install.ps1 -ProfileDir "D:\some\profile" -DryRun
#       .\install.ps1 -Restore
#   * piped from GitHub, where parameters cannot exist:
#       irm <raw url of this file> | iex
#       $env:DSH_RTL_RESTORE=1; irm <raw url> | iex
#
# When piped, options are read from the environment instead, because Windows
# PowerShell 5.1 cannot parse a param() block or a [CmdletBinding()] attribute
# out of piped input. The recognized variables are:
#
#   DSH_PROFILE          profile name (a launched Harness already sets this)
#   DSH_PROFILE_DIR      full profile directory, winning over DSH_PROFILE
#   DSH_RTL_PROFILE_DIR  the same, explicit to this installer
#   DSH_RTL_SOURCE       directory holding the plugin payload
#   DSH_RTL_REPO         GitHub 'owner/name' or 'owner/name@ref'
#   DSH_RTL_REF          branch, tag, or commit
#   DSH_RTL_RESTORE=1    remove the plugin
#   DSH_RTL_DRY_RUN=1    report the planned changes only
#
# The plugin payload is taken from, in order: DSH_RTL_SOURCE when set; the
# `dsh-rtl-smart-patcher` directory beside this file; the GitHub archive named by
# DSH_RTL_REPO, which is what makes the piped one-line install work with no
# checkout at all. A running app picks a newly selected bundle up on its next
# start; reloading the page alone is not enough for a first installation.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$PluginName = 'dsh-rtl-smart-patcher'
$PluginVersion = '1.0.0'
$payload = @(
    'package.json',
    'cordis.patch.yml',
    'icon.svg',
    'lib\index.js',
    'lib\client.js',
    'locale\en.json',
    'locale\fa.json'
)

# Options arrive as parameters when this runs as a file, and stay unset when it
# arrives through Invoke-Expression; the environment takes over in that case.
if (-not (Get-Variable -Name ProfileName -ErrorAction SilentlyContinue)) { $ProfileName = $null }
if (-not (Get-Variable -Name ProfileDir -ErrorAction SilentlyContinue)) { $ProfileDir = $null }
if (-not (Get-Variable -Name Source -ErrorAction SilentlyContinue)) { $Source = $null }
if (-not (Get-Variable -Name Repo -ErrorAction SilentlyContinue)) { $Repo = $null }
if (-not (Get-Variable -Name Ref -ErrorAction SilentlyContinue)) { $Ref = $null }
if (-not (Get-Variable -Name Restore -ErrorAction SilentlyContinue)) { $Restore = $false }
if (-not (Get-Variable -Name DryRun -ErrorAction SilentlyContinue)) { $DryRun = $false }

if (-not $ProfileName -and $env:DSH_PROFILE) { $ProfileName = $env:DSH_PROFILE }
if (-not $ProfileDir -and $env:DSH_RTL_PROFILE_DIR) { $ProfileDir = $env:DSH_RTL_PROFILE_DIR }
if (-not $ProfileDir -and $env:DSH_PROFILE_DIR) { $ProfileDir = $env:DSH_PROFILE_DIR }
if (-not $Source -and $env:DSH_RTL_SOURCE) { $Source = $env:DSH_RTL_SOURCE }
if (-not $Repo -and $env:DSH_RTL_REPO) { $Repo = $env:DSH_RTL_REPO }
if (-not $Ref -and $env:DSH_RTL_REF) { $Ref = $env:DSH_RTL_REF }
if (-not $Restore -and $env:DSH_RTL_RESTORE) { $Restore = $true }
if (-not $DryRun -and $env:DSH_RTL_DRY_RUN) { $DryRun = $true }
if (-not $Repo) { $Repo = 'Ksrw/dsh-rtl-smart-patcher' }
if (-not $Ref) { $Ref = 'main' }

# $PSScriptRoot is empty when the script arrives through Invoke-Expression.
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$sideBySide = Join-Path (Split-Path -Parent $scriptDir) $PluginName
$workRoot = if ($PSScriptRoot) { Split-Path -Parent $scriptDir } else { Join-Path $env:TEMP $PluginName }

# Node is optional: it is used only to re-indent the profile manifest to the
# two-space form the app itself writes. The runtime the desktop app ships is
# preferred over whatever happens to be on PATH.
$script:nodePath = $null
foreach ($candidate in @(
        (Join-Path $HOME '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe')
    )) {
    if (Test-Path -LiteralPath $candidate) { $script:nodePath = $candidate; break }
}
if (-not $script:nodePath) {
    $onPath = Get-Command node -ErrorAction SilentlyContinue
    if ($onPath) { $script:nodePath = $onPath.Source }
}

function Write-Ok([string]$Message) { Write-Host "  [ok] $Message" -ForegroundColor Green }
function Write-Info([string]$Message) { Write-Host "  [--] $Message" -ForegroundColor DarkGray }
function Write-Warn2([string]$Message) { Write-Host "  [!!] $Message" -ForegroundColor Yellow }

function Resolve-ProfileDirectory {
    if ($ProfileDir) { return (Resolve-Path -LiteralPath $ProfileDir).Path }

    $name = if ($ProfileName) { $ProfileName } else { 'desktop' }
    $harnessHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
    return (Join-Path $harnessHome "profiles\$name")
}

function Read-ProfileManifest([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "profile manifest not found: $Path`nStart the DeepSeek Harness app once so it creates its profile, or set `$env:DSH_PROFILE_DIR."
    }
    return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Write-ProfileManifest([string]$Path, $Manifest) {
    # Windows PowerShell 5.1 has no System.Text.Json and its ConvertTo-Json
    # indents far too deeply for a readable diff, so the manifest is written in
    # the app's own shape (no BOM, trailing newline) and then re-indented to two
    # spaces by tools/format-profile-manifest.js when node and that tool exist.
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $json = $Manifest | ConvertTo-Json -Depth 32
    [System.IO.File]::WriteAllText($Path, ($json + "`n"), $utf8NoBom)
    $formatter = Join-Path $workRoot 'tools\format-profile-manifest.js'
    if ((Test-Path -LiteralPath $formatter) -and $script:nodePath) {
        & $script:nodePath $formatter $Path | Out-Null
    }
}

function Get-DependencyTable($Manifest) {
    $table = [ordered]@{}
    if ($Manifest.PSObject.Properties['dependencies'] -and $Manifest.dependencies) {
        foreach ($property in ($Manifest.dependencies.PSObject.Properties | Sort-Object Name)) {
            $table[$property.Name] = $property.Value
        }
    }
    return $table
}

# Resolve the directory that holds the plugin payload. Falls back to a GitHub
# archive, so the piped one-line install works with no checkout at all. A zip
# (GitHub's refs/heads/.../zip) and a tarball both work, because Windows'
# bundled tar.exe reads either format; only the extension differs.
function Resolve-PayloadDirectory {
    if ($Source) {
        if (-not (Test-Path -LiteralPath (Join-Path $Source 'package.json'))) {
            throw "the payload directory does not contain package.json: $Source"
        }
        return (Resolve-Path -LiteralPath $Source).Path
    }

    if (Test-Path -LiteralPath (Join-Path $sideBySide 'package.json')) { return $sideBySide }

    $spec = $Repo
    $reference = $Ref
    if ($Repo -match '^(?<owner>[^/]+/[^/@]+)@(?<ref>.+)$') {
        $spec = $Matches['owner']
        $reference = $Matches['ref']
    }

    $url = "https://codeload.github.com/$spec/zip/refs/heads/$reference"
    $archive = Join-Path $env:TEMP "$PluginName-$reference.zip"
    $extractDir = Join-Path $env:TEMP "$PluginName-$reference-src"
    $cached = Join-Path $extractDir $PluginName

    # A previous download still on disk is reused, so retrying after a failure in
    # a later step needs no network at all.
    if (Test-Path -LiteralPath (Join-Path $cached 'package.json')) {
        Write-Info "reusing the downloaded plugin at $cached"
        return $cached
    }

    Write-Info "downloading $spec at $reference"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing
    [System.IO.File]::WriteAllBytes($archive, $response.Content)

    if (Test-Path -LiteralPath $extractDir) { Remove-Item -LiteralPath $extractDir -Recurse -Force }
    New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
    tar.exe -xf $archive -C $extractDir
    if ($LASTEXITCODE -ne 0) { throw "could not extract $archive (tar exited $LASTEXITCODE)" }

    $found = Get-ChildItem -LiteralPath $extractDir -Recurse -Filter 'package.json' -File |
        Where-Object { (Split-Path -Leaf (Split-Path -Parent $_.FullName)) -eq $PluginName } |
        Select-Object -First 1
    if (-not $found) { throw "the downloaded archive contains no $PluginName/package.json" }

    $resolved = Split-Path -Parent $found.FullName
    Write-Ok "downloaded the plugin to $resolved"
    return $resolved
}

# ---------------------------------------------------------------- resolution

Write-Host ''
Write-Host "RTL Smart Patcher — $(if ($Restore) { 'uninstall' } else { 'install' })" -ForegroundColor Cyan
Write-Host ''

$profilePath = Resolve-ProfileDirectory
$manifestPath = Join-Path $profilePath 'package.json'
$targetDir = Join-Path $profilePath "node_modules\$PluginName"

Write-Host "  profile : $profilePath"
Write-Host "  package : $PluginName (version $PluginVersion)"
Write-Host "  target  : $targetDir"
if ($DryRun) { Write-Warn2 'dry run: nothing will be written' }
Write-Host ''

$manifest = Read-ProfileManifest $manifestPath
if (-not $manifest.PSObject.Properties['dsh'] -or -not $manifest.dsh.PSObject.Properties['profile']) {
    throw "$manifestPath is not a DSH profile manifest (no dsh.profile section)."
}

$bundles = @()
if ($manifest.dsh.profile.PSObject.Properties['bundles']) { $bundles = @($manifest.dsh.profile.bundles) }
$dependencies = Get-DependencyTable $manifest

# ----------------------------------------------------------------- uninstall

if ($Restore) {
    $changed = $false

    if ($bundles -contains $PluginName) {
        $manifest.dsh.profile.bundles = @($bundles | Where-Object { $_ -ne $PluginName })
        $changed = $true
        Write-Ok "removed '$PluginName' from dsh.profile.bundles"
    } else {
        Write-Info 'not selected in dsh.profile.bundles'
    }

    if ($dependencies.Contains($PluginName)) {
        $dependencies.Remove($PluginName)
        $manifest.dependencies = $dependencies
        $changed = $true
        Write-Ok "removed '$PluginName' from dependencies"
    } else {
        Write-Info 'not recorded in dependencies'
    }

    if ($changed -and -not $DryRun) { Write-ProfileManifest $manifestPath $manifest }

    if (Test-Path -LiteralPath $targetDir) {
        if ($DryRun) {
            Write-Info "would delete $targetDir"
        } else {
            Remove-Item -LiteralPath $targetDir -Recurse -Force
            Write-Ok "deleted $targetDir"
        }
    }

    Write-Host ''
    Write-Host 'Uninstalled. Restart DeepSeek Harness to unload the plugin.' -ForegroundColor Green
    Write-Host ''
    return
}

# ------------------------------------------------------------------- install

$payloadDir = Resolve-PayloadDirectory

foreach ($relative in $payload) {
    $file = Join-Path $payloadDir $relative
    if (-not (Test-Path -LiteralPath $file)) { throw "plugin payload is incomplete, missing: $file" }
}

# Validate the files the host parses before any of them are copied.
$pluginManifest = Get-Content -LiteralPath (Join-Path $payloadDir 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($pluginManifest.name -ne $PluginName) { throw "package.json name is '$($pluginManifest.name)', expected '$PluginName'" }
if (-not $pluginManifest.dsh.client) { throw 'package.json declares no dsh.client section' }
if (-not $pluginManifest.dsh.bundle) { throw 'package.json declares no dsh.bundle section' }
$patchText = Get-Content -LiteralPath (Join-Path $payloadDir 'cordis.patch.yml') -Raw -Encoding UTF8
if ($patchText -notmatch [regex]::Escape($PluginName)) { throw 'cordis.patch.yml does not name the plugin' }
Write-Ok "payload verified at $payloadDir"

if ($DryRun) {
    Write-Info "would copy $($payload.Count) files to $targetDir"
    if ($bundles -notcontains $PluginName) { Write-Info "would append '$PluginName' to dsh.profile.bundles" }
    if (-not $dependencies.Contains($PluginName)) { Write-Info "would record dependency $PluginName at version $PluginVersion" }
    Write-Host ''
    Write-Host 'Dry run complete.' -ForegroundColor Green
    Write-Host ''
    return
}

if (-not (Test-Path -LiteralPath $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
foreach ($relative in $payload) {
    $destination = Join-Path $targetDir $relative
    $parent = Split-Path -Parent $destination
    if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Copy-Item -LiteralPath (Join-Path $payloadDir $relative) -Destination $destination -Force
}
Write-Ok "copied the plugin package to $targetDir"

if ($bundles -notcontains $PluginName) {
    $manifest.dsh.profile.bundles = @($bundles + $PluginName)
    Write-Ok "added '$PluginName' to dsh.profile.bundles"
} else {
    Write-Info 'already selected in dsh.profile.bundles'
}

if (-not $dependencies.Contains($PluginName)) {
    $dependencies[$PluginName] = $PluginVersion
    $manifest.dependencies = $dependencies
    Write-Ok "recorded dependency $PluginName at version $PluginVersion"
} else {
    Write-Info 'already recorded in dependencies'
}

Write-ProfileManifest $manifestPath $manifest
Write-Ok "updated $manifestPath"

Write-Host ''
Write-Host 'Installed.' -ForegroundColor Green
Write-Host 'Restart DeepSeek Harness, then switch the layout with the small LTR/RTL control in' -ForegroundColor Gray
Write-Host 'the page corner, the Plugins page, or Ctrl+Alt+R.' -ForegroundColor Gray
Write-Host ''
