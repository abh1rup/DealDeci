@echo off
echo.
echo  ============================================
echo   DealDeci Pitch Decimator AI - Installer
echo   Copyright 2026 DealDeci LLC
echo  ============================================
echo.

:: Check Docker is installed
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Docker is not installed.
    echo  Download from: https://docker.com/products/docker-desktop
    echo  Install it, restart your PC, then run this again.
    pause
    exit /b 1
)

:: Check Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Docker is not running.
    echo  Open Docker Desktop and wait for the green indicator, then run this again.
    pause
    exit /b 1
)

echo  [OK] Docker is running.
echo.

:: Create .env if it doesn't exist
if not exist .env (
    echo  Creating .env file...
    copy .env.example .env >nul

    :: Prompt for API key
    echo.
    set /p APIKEY="  Enter your Anthropic API key (sk-ant-...): "

    :: Write the key into .env
    powershell -Command "(Get-Content .env) -replace 'sk-ant-xxxxxxxxxxxxxxxxxxxxx', '%APIKEY%' | Set-Content .env"

    echo.
    echo  [OK] API key saved to .env
) else (
    echo  [OK] .env already exists, skipping.
)

echo.
echo  Building and starting DealDeci...
echo  (This may take 2-3 minutes on first run)
echo.

docker compose up --build -d

if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Docker build failed. Check the output above.
    pause
    exit /b 1
)

echo.
echo  ============================================
echo   DealDeci is running!
echo.
echo   Open your browser to: http://localhost
echo.
echo   Login:  admin@dealdeci.com
echo   Pass:   dealdeci2026
echo  ============================================
echo.
echo  To stop:    docker compose down
echo  To restart: docker compose up -d
echo.
pause
