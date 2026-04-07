@echo off
echo =======================================
echo     Starting AutoWiki AI Services
echo =======================================

echo.
echo Starting Next.js Frontend (port 3000)...
start "AutoWiki Frontend" cmd /k "cd frontend && npm run dev"

echo Starting FastAPI Backend (port 8000)...
start "AutoWiki Backend" cmd /k "cd backend && call .\venv\Scripts\activate.bat && uvicorn main:app --reload"

echo.
echo Both services are spinning up in separate windows!
echo - Frontend: http://localhost:3000
echo - Backend: http://localhost:8000
echo.
echo You can close this window.
