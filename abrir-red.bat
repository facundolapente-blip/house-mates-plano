@echo off
cd /d "%~dp0"
title House Mates Plano (con celulares)
where node >nul 2>nul
if errorlevel 1 (
  echo Para usar House Mates Plano hace falta instalar Node.js desde https://nodejs.org
  pause
  exit /b 1
)
echo House Mates Plano abierto para los celulares de la misma red wifi.
echo En la app, en el panel del proyecto, "Checklist en el celular" muestra el QR para escanear.
echo Para cerrarlo, cerra esta ventana.
node server.mjs --abrir --red
if errorlevel 1 pause
