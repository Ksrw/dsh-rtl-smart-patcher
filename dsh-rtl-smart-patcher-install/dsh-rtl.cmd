@echo off
rem ─────────────────────────────────────────────────────────────────────────────
rem  RTL Smart Patcher for DeepSeek Harness — one-line launcher for CMD and
rem  PowerShell. It only forwards to install.ps1, which owns every file change.
rem
rem    dsh-rtl.cmd                     install (or update) the plugin
rem    dsh-rtl.cmd restore             remove the plugin
rem    dsh-rtl.cmd install -DryRun     show the planned changes
rem    dsh-rtl.cmd install -ProfileDir "D:\path\to\profile"
rem ─────────────────────────────────────────────────────────────────────────────
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
set "ACTION=%~1"
if "%ACTION%"=="" set "ACTION=install"

if /i "%ACTION%"=="install" goto run
if /i "%ACTION%"=="update" goto run
if /i "%ACTION%"=="restore" goto run_restore
if /i "%ACTION%"=="uninstall" goto run_restore
if /i "%ACTION%"=="remove" goto run_restore
if /i "%ACTION%"=="--help" goto usage
if /i "%ACTION%"=="-h" goto usage
if /i "%ACTION%"=="/?" goto usage

echo dsh-rtl: unknown action "%ACTION%"
goto usage

:run
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install.ps1" %2 %3 %4 %5 %6
exit /b %errorlevel%

:run_restore
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install.ps1" -Restore %2 %3 %4 %5 %6
exit /b %errorlevel%

:usage
echo.
echo   RTL Smart Patcher for DeepSeek Harness
echo.
echo   Usage:
echo     dsh-rtl.cmd                  install or update the plugin
echo     dsh-rtl.cmd restore          remove the plugin
echo     dsh-rtl.cmd install -DryRun  report the planned changes only
echo.
echo   No checkout needed (PowerShell):
echo     irm https://raw.githubusercontent.com/Ksrw/dsh-rtl-smart-patcher/main/dsh-rtl-smart-patcher-install/install.ps1 ^| iex
echo.
echo   After installing, restart DeepSeek Harness. The layout switches with the
echo   small LTR/RTL control in the page corner, the Plugins page, or Ctrl+Alt+R.
echo.
exit /b 0
