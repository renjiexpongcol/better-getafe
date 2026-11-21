@echo off
cd /d "%~dp0"
echo Starting Better Getafe...
call npm.cmd run dev
if errorlevel 1 (
  echo.
  echo Better Getafe stopped. Review the message above, then press any key to close.
  pause >nul
  exit /b 1
)
