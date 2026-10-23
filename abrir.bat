@echo off
cd /d "%~dp0"
title House Mates Plano
where node >nul 2>nul
if errorlevel 1 (
  echo Para usar House Mates Plano hace falta instalar Node.js desde https://nodejs.org
  pause
  exit /b 1
)
echo House Mates Plano esta abierto en el navegador.
echo Para cerrarlo, cerra esta ventana.
node server.mjs --abrir
if errorlevel 1 pause
