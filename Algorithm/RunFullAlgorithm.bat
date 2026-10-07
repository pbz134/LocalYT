@echo off
setlocal enabledelayedexpansion

REM Step 1: Run the first Python script
echo Running create-filename-list.py...
"%~dp0..\venv\python.exe" "%~dp0create-filename-list.py" --untagged
if errorlevel 1 (
    echo Error running create-filename-list.py
    pause
    exit /b 1
)

REM Step 2: Start llama-server in the background
echo Starting llama-server.exe...
start "LlamaServer" "%~dp0llama-b11469-vulkan-win-x64\llama-server.exe" -m "%~dp0embeddinggemma-2-BF16.gguf" --port 8081 --embedding --ctx-size 2048

REM Step 3: Wait for the model to fully load by checking /health endpoint
echo Waiting for model to load...
echo Checking http://localhost:8081/health every 2 seconds...
set max_attempts=300
set attempt=1
set model_loaded=0

:check_model
echo Attempt !attempt! of !max_attempts!...

powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:8081/health' -Method GET -TimeoutSec 5; if ($response.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"

if %errorlevel%==0 (
    set model_loaded=1
    echo Model is loaded and ready!
    goto model_ready
)

if !attempt! geq !max_attempts! (
    echo Failed to detect model loading after !max_attempts! attempts.
    echo Killing llama-server process...
    taskkill /FI "WINDOWTITLE eq LlamaServer" /F >nul 2>&1
    pause
    exit /b 1
)

timeout /t 2 /nobreak >nul
set /a attempt+=1
goto check_model

:model_ready

REM Step 4: Run the analyze.py script
echo Running analyze.py...
"%~dp0..\venv\python.exe" "%~dp0analyze.py"
if errorlevel 1 (
    echo Error running analyze.py
)

REM Step 5: Cleanup - kill llama-server
echo Cleaning up...
taskkill /FI "WINDOWTITLE eq LlamaServer" /F >nul 2>&1

pause