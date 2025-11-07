#!/usr/bin/env pwsh
# Complete startup script for JobHunter ML project
# Starts all services in the correct order

Write-Host "🚀 Starting JobHunter ML Development Environment..." -ForegroundColor Green

# Check if bun is available
try {
    $bunVersion = bun --version
    Write-Host "✅ Bun version: $bunVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Bun not found. Adding to PATH..." -ForegroundColor Red
    $env:PATH = $env:PATH + ";$env:USERPROFILE\.bun\bin"
    try {
        $bunVersion = bun --version
        Write-Host "✅ Bun version: $bunVersion" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to find Bun. Please install it first." -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n🔥 Starting services..." -ForegroundColor Yellow

# Change to project root
Set-Location "C:\Users\Vaibhav Sharma\Desktop\designProject\jobhunterwithml1"

Write-Host "`n1️⃣ Starting Python ML Service..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'C:\Users\Vaibhav Sharma\Desktop\designProject\jobhunterwithml1\backend\python'; .\venv\Scripts\activate; python start_optimized.py"

Write-Host "⏳ Waiting for Python service to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host "`n2️⃣ Starting TypeScript Backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'C:\Users\Vaibhav Sharma\Desktop\designProject\jobhunterwithml1\backend'; bun run dev"

Write-Host "⏳ Waiting for backend to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

Write-Host "`n3️⃣ Starting Frontend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'C:\Users\Vaibhav Sharma\Desktop\designProject\jobhunterwithml1\frontend\project'; npm run dev"

Write-Host "`n🎉 All services starting!" -ForegroundColor Green
Write-Host "📱 Frontend: http://localhost:5173" -ForegroundColor Magenta
Write-Host "🔧 Backend: http://localhost:3001" -ForegroundColor Magenta  
Write-Host "🤖 Python ML: http://localhost:5000" -ForegroundColor Magenta

Write-Host "`n💡 Press any key to exit..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")