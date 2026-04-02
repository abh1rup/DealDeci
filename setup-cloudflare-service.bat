@echo off
echo.
echo  ============================================
echo   DealDeci - Install Tunnel as Windows Service
echo   (Runs automatically on startup)
echo  ============================================
echo.
echo  NOTE: Run this as Administrator (right-click, Run as admin)
echo.

cloudflared service install
if %errorlevel% equ 0 (
    echo.
    echo  [OK] Tunnel installed as Windows service.
    echo  It will start automatically when Windows boots.
    echo.
    echo  To manage:
    echo    Start:   net start cloudflared
    echo    Stop:    net stop cloudflared
    echo    Remove:  cloudflared service uninstall
) else (
    echo.
    echo  [ERROR] Failed. Make sure you ran this as Administrator.
)
echo.
pause
