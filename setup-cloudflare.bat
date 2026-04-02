@echo off
echo.
echo  ============================================
echo   DealDeci - Cloudflare Tunnel Setup
echo   Exposes your local app to the internet
echo  ============================================
echo.

:: Check if cloudflared is installed
cloudflared --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [STEP 1] Installing Cloudflare Tunnel...
    echo.
    echo  Downloading cloudflared...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi' -OutFile 'cloudflared.msi'"
    echo  Installing...
    msiexec /i cloudflared.msi /quiet /norestart
    del cloudflared.msi
    echo  [OK] cloudflared installed.
    echo.
    echo  IMPORTANT: Close this window and open a NEW command prompt,
    echo  then run this script again so cloudflared is in your PATH.
    echo.
    pause
    exit /b 0
)

echo  [OK] cloudflared is installed.
echo.

:: Check if already logged in
cloudflared tunnel list >nul 2>&1
if %errorlevel% neq 0 (
    echo  [STEP 2] Login to Cloudflare...
    echo  A browser window will open. Select your domain.
    echo.
    cloudflared tunnel login
    echo.
)

echo  [STEP 3] Creating tunnel "dealdeci"...
echo.
cloudflared tunnel create dealdeci 2>nul
if %errorlevel% neq 0 (
    echo  Tunnel "dealdeci" may already exist, continuing...
)

:: Get tunnel ID
for /f "tokens=1" %%i in ('cloudflared tunnel list -o json 2^>nul ^| powershell -Command "$input | ConvertFrom-Json | Where-Object {$_.name -eq 'dealdeci'} | Select-Object -ExpandProperty id"') do set TUNNEL_ID=%%i

if "%TUNNEL_ID%"=="" (
    echo  [ERROR] Could not find tunnel ID. Run: cloudflared tunnel list
    pause
    exit /b 1
)

echo  [OK] Tunnel ID: %TUNNEL_ID%
echo.

:: Ask for domain
set /p DOMAIN="  Enter your domain (e.g. app.dealdeci.com): "

echo.
echo  [STEP 4] Creating DNS route...
cloudflared tunnel route dns dealdeci %DOMAIN% 2>nul
echo.

:: Create config file
echo  [STEP 5] Writing tunnel config...
mkdir "%USERPROFILE%\.cloudflared" 2>nul

(
echo tunnel: %TUNNEL_ID%
echo credentials-file: %USERPROFILE%\.cloudflared\%TUNNEL_ID%.json
echo.
echo ingress:
echo   - hostname: %DOMAIN%
echo     service: http://localhost:80
echo   - service: http_status:404
) > "%USERPROFILE%\.cloudflared\config.yml"

echo  [OK] Config saved to %USERPROFILE%\.cloudflared\config.yml
echo.

:: Start the tunnel
echo  [STEP 6] Starting tunnel...
echo.
echo  ============================================
echo   Your app will be live at:
echo   https://%DOMAIN%
echo  ============================================
echo.
echo  Press Ctrl+C to stop the tunnel.
echo.

cloudflared tunnel run dealdeci
