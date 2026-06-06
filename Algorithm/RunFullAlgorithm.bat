@echo off
setlocal enabledelayedexpansion

REM Step 1: Run the first Python script
echo Running create-filename-list.py...
..\venv\python.exe create-filename-list.py --untagged
if errorlevel 1 (
    echo Error running create-filename-list.py
    pause
    exit /b 1
)

REM Step 2: Start koboldcpp in the background
echo Starting koboldcpp-nocuda.exe...
start "KoboldCPP" koboldcpp-nocuda.exe Model.kcpps

REM Step 3: Wait for the model to fully load by checking /api/v1/model endpoint
echo Waiting for model to load...
echo Checking http://localhost:5001/api/v1/model every 2 seconds...
set max_attempts=300  ; 10 minutes maximum (300 attempts * 2 seconds)
set attempt=1
set model_loaded=0

:check_model
echo Attempt !attempt! of !max_attempts!...

REM Check if the /api/v1/model endpoint returns valid JSON with a model name
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:5001/api/v1/model' -Method GET -TimeoutSec 5; if ($response.StatusCode -eq 200) { $content = $response.Content | ConvertFrom-Json; if ($content.result -and $content.result -ne '') { exit 0 } else { exit 1 } } else { exit 1 } } catch { exit 1 }"

if errorlevel 0 (
    set model_loaded=1
    echo Model is loaded and ready!
    goto model_ready
)

if !attempt! geq !max_attempts! (
    echo Failed to detect model loading after !max_attempts! attempts (10 minutes).
    echo Killing koboldcpp process...
    taskkill /FI "WINDOWTITLE eq KoboldCPP" /F >nul 2>&1
    pause
    exit /b 1
)

REM Wait 2 seconds before trying again
echo Model not ready yet, waiting 2 seconds...
timeout /t 2 /nobreak >nul
set /a attempt+=1
goto check_model

:model_ready

REM Step 4: Optional - get the actual model name for verification
echo Getting model information...
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:5001/api/v1/model' -Method GET -TimeoutSec 5; if ($response.StatusCode -eq 200) { $content = $response.Content | ConvertFrom-Json; Write-Host 'Loaded model:' $content.result; exit 0 } else { exit 1 } } catch { exit 1 }"

REM Step 5: Run the analyze.py script
echo Running analyze.py...
..\venv\python.exe analyze.py
if errorlevel 1 (
    echo Error running analyze.py
)

REM Step 6: Cleanup - kill koboldcpp
echo Cleaning up...
taskkill /FI "WINDOWTITLE eq KoboldCPP" /F >nul 2>&1

pause