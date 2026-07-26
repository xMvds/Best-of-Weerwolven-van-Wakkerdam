@echo off
title Best of Weerwolven van Wakkerdam - Localhost

cd /d "%~dp0"

echo ==============================================
echo  Best of Weerwolven van Wakkerdam - Localhost
echo ==============================================
echo.
echo Dit venster moet open blijven zolang je het spel speelt.
echo Sluit dit venster pas als je de server wilt stoppen.
echo.

echo Projectmap:
echo %CD%
echo.

if not exist "package.json" (
  echo FOUT: package.json is niet gevonden.
  echo Controleer of dit .bat-bestand in de hoofdmap van het project staat.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo FOUT: npm is niet gevonden.
  echo Installeer Node.js via https://nodejs.org/ en probeer daarna opnieuw.
  echo.
  pause
  exit /b 1
)

echo Onderdelen installeren/controleren...
echo.
call npm install
if errorlevel 1 (
  echo.
  echo FOUT: npm install is mislukt.
  echo Kopieer deze console-output en stuur die door als debug.
  echo.
  pause
  exit /b 1
)

echo.
echo Server starten...
echo.
echo Zodra de server gereed is, openen deze drie tabbladen automatisch:
echo   Speler:     http://localhost:3000/player
echo   Host:       http://localhost:3000/host
echo   Infoscherm: http://localhost:3000/info
echo.
echo Laat dit venster open. Druk op Ctrl+C om de server te stoppen.
echo.

start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "$deadline=(Get-Date).AddSeconds(60); $ready=$false; while((Get-Date) -lt $deadline){ try { $response=Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/host' -TimeoutSec 1; if($response.StatusCode -eq 200){ $ready=$true; break } } catch {}; Start-Sleep -Milliseconds 250 }; if($ready){ Start-Process 'http://localhost:3000/player'; Start-Process 'http://localhost:3000/host'; Start-Process 'http://localhost:3000/info' }"
call npm start

echo.
echo De server is gestopt of kon niet starten.
echo Kopieer eventueel de foutmelding hierboven.
echo.
pause
