#!/usr/bin/env pwsh
# Quick fix for Bun PATH issue
# Run this if bun command is not found

Write-Host "🔧 Fixing Bun PATH issue..." -ForegroundColor Yellow

# Check if profile exists
if (-not (Test-Path $PROFILE)) {
    Write-Host "📝 Creating PowerShell profile..." -ForegroundColor Cyan
    New-Item -ItemType File -Path $PROFILE -Force | Out-Null
}

# Check if bun is already in profile
$profileContent = Get-Content $PROFILE -ErrorAction SilentlyContinue
if ($profileContent -notcontains '$env:PATH = $env:PATH + ";$env:USERPROFILE\.bun\bin"') {
    Write-Host "➕ Adding Bun to PowerShell profile..." -ForegroundColor Cyan
    Add-Content -Path $PROFILE -Value '$env:PATH = $env:PATH + ";$env:USERPROFILE\.bun\bin"'
} else {
    Write-Host "✅ Bun already in PowerShell profile" -ForegroundColor Green
}

# Reload profile
Write-Host "🔄 Reloading PowerShell profile..." -ForegroundColor Cyan
. $PROFILE

# Test bun
try {
    $bunVersion = bun --version
    Write-Host "✅ Bun is working! Version: $bunVersion" -ForegroundColor Green
    Write-Host "🎉 PATH issue fixed! You can now use 'bun' command in new terminals." -ForegroundColor Green
} catch {
    Write-Host "❌ Bun still not working. Manual installation may be required." -ForegroundColor Red
    Write-Host "💡 Try running: curl -fsSL https://bun.sh/install | powershell" -ForegroundColor Yellow
}

Write-Host "`n💡 Press any key to continue..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")