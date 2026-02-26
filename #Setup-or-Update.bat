@echo off
setlocal enabledelayedexpansion

echo Generating missing channel pictures...
.\venv\python.exe createChannelpics.py

echo Generating missing sub counts...
.\venv\python.exe createChannelsubs.py

echo Fixing umlauts before moving metadata...
.\venv\python.exe LocalYT-Rev-Files\FixUmlauts.py --apply

echo Cleaning up file names (making 4k Video Downloader file names compatible with yt-dlp file names)...
.\venv\python.exe LocalYT-Rev-Files\remove_special_characters.py

echo Removing emojis from file names...
.\venv\python.exe LocalYT-Rev-Files\remove_emojis.py

echo Generating thumbnails...
.\venv\python.exe generateThumbnails.py

echo Generating video stats...
.\venv\python.exe createstats.py

echo Cropping all thumbnails to 16:9...
.\venv\python.exe LocalYT-Rev-Files\CropThumbnails.py

echo Generating videolengths...
.\venv\python.exe createvideolengths.py
goto continue

echo Creating missing file dates...
.\venv\python.exe createFiledates.py
goto continue

:skipvideolengths
echo Skipping video length generation...
goto continue

:continue
echo Generating view counts...
.\venv\python.exe createviews.py

echo running Algorithm setup...

REM Step 1: Run create-filename-list.py from Algorithm directory
cd Algorithm
.\venv\python.exe create-filename-list.py --untagged
if errorlevel 1 (
    echo Error running create-filename-list.py
    cd ..
    pause
    exit /b 1
)

REM Step 2: Start koboldcpp in the background (from root directory)
cd ..
echo Starting koboldcpp-nocuda.exe...
start "KoboldCPP" /D "Algorithm" koboldcpp-nocuda.exe model.kcpps

REM Step 3: Wait for the model to fully load
echo Waiting for model to load...
echo Checking http://localhost:5001/api/v1/model every 2 seconds...
set max_attempts=300
set attempt=1
set model_loaded=0
set first_success=0

:check_model
echo Attempt !attempt! of !max_attempts!...

powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:5001/api/v1/model' -Method GET -TimeoutSec 5; if ($response.StatusCode -eq 200) { $content = $response.Content | ConvertFrom-Json; if ($content.result -and $content.result -ne '') { exit 0 } else { exit 1 } } else { exit 1 } } catch { exit 1 }"

if errorlevel 0 (
    if !first_success! equ 0 (
        echo Model endpoint reachable! Waiting additional 10 seconds for complete loading...
        set first_success=1
        timeout /t 10 /nobreak >nul
        goto check_model
    ) else (
        set model_loaded=1
        echo Model is loaded and ready!
        goto model_ready
    )
)

if !attempt! geq !max_attempts! (
    echo Failed to detect model loading after !max_attempts! attempts (10 minutes).
    echo Killing koboldcpp process...
    taskkill /FI "WINDOWTITLE eq KoboldCPP" /F >nul 2>&1
    pause
    exit /b 1
)

if !first_success! equ 0 (
    echo Model not ready yet, waiting 2 seconds...
    timeout /t 2 /nobreak >nul
    set /a attempt+=1
    goto check_model
)

:model_ready

REM Step 4: Run analyze.py from Algorithm directory
cd Algorithm
.\venv\python.exe analyze.py
if errorlevel 1 (
    echo Error running analyze.py
    cd ..
    REM Continue with cleanup even if analyze.py fails
)

REM Step 5: Cleanup - kill koboldcpp
cd ..
echo Cleaning up...
taskkill /F /IM koboldcpp-nocuda.exe >nul 2>&1

echo Continuing with other tasks...

echo Organizing playlist metadata...
.\venv\python.exe LocalYT-Rev-Files\MovePlaylistMetadata.py

echo Generating filenames...
.\venv\python.exe createFilenames.py

echo Fixing umlauts after metadata...
.\venv\python.exe LocalYT-Rev-Files\FixUmlauts.py

echo Regenerating filedates...
.\venv\python.exe createFiledates.py

echo Removing double spaces...
.\venv\python.exe LocalYT-Rev-Files\FixDoubleSpaces.py

echo.
echo =============================================================================
echo All metadata, thumbnails and playlists generated. Server is ready for launch.
echo =============================================================================
echo.
pause