# Enterprise Admin System - Development Shortcut Script
# 🚀 This script starts the Database, Backend, and Frontend in parallel.

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "   Enterprise Admin System - Control Center    " -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan

# 1. Start Docker (Postgres)
Write-Host "[1/3] Starting Docker infrastructure (PostgreSQL)..." -ForegroundColor Yellow
docker-compose up -d postgres

# Check if docker started successfully
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to start Docker. Please ensure Docker Desktop is running."
    exit
}

# 2. Start Backend
Write-Host "[2/3] Launching Backend API (Port 3000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; @Host.UI.RawUI.WindowTitle = 'Admin Backend'; npm run dev"

# 3. Start Frontend
Write-Host "[3/3] Launching Admin UI (Port 5173)..." -ForegroundColor Magenta
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd admin-ui; @Host.UI.RawUI.WindowTitle = 'Admin UI'; npm run dev"

Write-Host ""
Write-Host "✨ All systems are starting up!" -ForegroundColor Cyan
Write-Host "➤ Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "➤ Backend:  http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "Keep this window open to manage Docker, or close it after startup."
