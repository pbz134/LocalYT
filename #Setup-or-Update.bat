@echo off
setlocal enabledelayedexpansion

:: Check if #Setup.env exists
set "LLM_TAGGING=yes"
set "SEEKBAR_PREVIEWS=yes"
set "SUBTITLES=yes"
set "THUMBNAIL_MODE=zoom"

if exist "#Setup.env" (
    echo Found #Setup.env, loading preferences...
    for /f "tokens=1,* delims==" %%a in (#Setup.env) do (
        if /i "%%a"=="LLM_TAGGING" set "LLM_TAGGING=%%b"
        if /i "%%a"=="SEEKBAR_PREVIEWS" set "SEEKBAR_PREVIEWS=%%b"
        if /i "%%a"=="SUBTITLES" set "SUBTITLES=%%b"
        if /i "%%a"=="THUMBNAIL_MODE" set "THUMBNAIL_MODE=%%b"
    )
    goto env_loaded
)

echo #Setup.env not found. Please configure your preferences:

:ask_subtitles
set /p "subtitles_choice=Do you want to add subtitles to your videos? (y/n): "
if /i "!subtitles_choice!"=="y" (
    set "SUBTITLES=yes"
) else if /i "!subtitles_choice!"=="n" (
    set "SUBTITLES=no"
) else (
    echo Please enter y or n.
    goto ask_subtitles
)

:ask_llm
set /p "llm_choice=Do you want to do the LLM video tagging? (y/n): "
if /i "!llm_choice!"=="y" (
    set "LLM_TAGGING=yes"
) else if /i "!llm_choice!"=="n" (
    set "LLM_TAGGING=no"
) else (
    echo Please enter y or n.
    goto ask_llm
)

:ask_seekbar
set /p "seekbar_choice=Do you want to generate seek bar previews? (y/n): "
if /i "!seekbar_choice!"=="y" (
    set "SEEKBAR_PREVIEWS=yes"
) else if /i "!seekbar_choice!"=="n" (
    set "SEEKBAR_PREVIEWS=no"
) else (
    echo Please enter y or n.
    goto ask_seekbar
)

:ask_thumbnail
echo How do you want to fix non-16:9 thumbnails?
echo 1. Zoom in to 16:9 (default)
echo 2. Add black borders to make 16:9
echo 3. Add colored borders (using most common color)
set /p "thumbnail_choice=Enter 1, 2, or 3: "
if "!thumbnail_choice!"=="1" (
    set "THUMBNAIL_MODE=zoom"
) else if "!thumbnail_choice!"=="2" (
    set "THUMBNAIL_MODE=black"
) else if "!thumbnail_choice!"=="3" (
    set "THUMBNAIL_MODE=color"
) else (
    echo Please enter 1, 2, or 3.
    goto ask_thumbnail
)

:: Save choices to #Setup.env for future runs
echo SUBTITLES=!SUBTITLES!> "#Setup.env"
echo LLM_TAGGING=!LLM_TAGGING!>> "#Setup.env"
echo SEEKBAR_PREVIEWS=!SEEKBAR_PREVIEWS!>> "#Setup.env"
echo THUMBNAIL_MODE=!THUMBNAIL_MODE!>> "#Setup.env"
echo.
echo Preferences saved to #Setup.env. You won't be asked again.
echo.

:env_loaded
echo Generating missing channel pictures...
.\venv\python.exe .\LocalYT-Rev-Files\createChannelpics.py

echo Generating missing sub counts...
.\venv\python.exe .\LocalYT-Rev-Files\createChannelsubs.py

echo Randomizing last subcount digits...
.\venv\python.exe .\LocalYT-Rev-Files\createRandomSubcounts.py

echo Organizing Community posts...
.\venv\python.exe .\LocalYT-Rev-Files\FormatCommunityPosts.py

echo Fixing comment underscores...
.\venv\python.exe .\LocalYT-Rev-Files\FixCommentUnderscores.py

echo Fixing _NA in subtitle file names...
.\venv\python.exe .\LocalYT-Rev-Files\FixSubNA.py

echo Deduplicating general English and US English subtitles...
.\venv\python.exe .\LocalYT-Rev-Files\FixEnglishSubDupes.py

:: Subtitles Section
if /i "!SUBTITLES!"=="yes" (
    echo Generating subtitles...
    .\venv\python.exe .\LocalYT-Rev-Files\run.py --all --model small.en --task transcribe -y
) else (
    echo Skipping subtitle generation...
)

echo Fixing auto-generated subtitle structuring...
.\venv\python.exe .\LocalYT-Rev-Files\srt_fixer_cli.py -idir subtitles -odir subtitles

echo Fixing umlauts before moving metadata...
.\venv\python.exe .\LocalYT-Rev-Files\FixUmlauts.py --apply

echo Cleaning up file names (making 4k Video Downloader file names compatible with yt-dlp file names)...
.\venv\python.exe .\LocalYT-Rev-Files\remove_special_characters.py

echo Removing emojis from file names...
.\venv\python.exe .\LocalYT-Rev-Files\remove_emojis.py

echo Generating thumbnails...
.\venv\python.exe .\LocalYT-Rev-Files\createThumbnails.py

echo Generating video stats...
.\venv\python.exe .\LocalYT-Rev-Files\createVideostats.py

echo Calculating total channel view counts and archived date...
.\venv\python.exe .\LocalYT-Rev-Files\createChannelstats.py

echo Cropping all thumbnails to 16:9...
.\venv\python.exe .\LocalYT-Rev-Files\CropThumbnails.py --mode !THUMBNAIL_MODE!

echo Generating videolengths...
.\venv\python.exe .\LocalYT-Rev-Files\createVideolengths.py
goto continue

:skipvideolengths
echo Skipping video length generation...
goto continue

:continue
echo Generating view counts...
.\venv\python.exe .\LocalYT-Rev-Files\createviews.py

:: LLM Video Tagging Section
if /i "!LLM_TAGGING!"=="yes" (
    echo running Algorithm setup...

    REM Step 1: Run create-filename-list.py from Algorithm directory
    cd Algorithm
    ..\venv\python.exe create-filename-list.py --untagged
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
    ..\venv\python.exe analyze.py
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
) else (
    echo Skipping LLM video tagging...
)

echo Organizing playlist metadata...
.\venv\python.exe .\LocalYT-Rev-Files\MovePlaylistMetadata.py

echo Generating filenames...
.\venv\python.exe .\LocalYT-Rev-Files\createFilenames.py

echo Fixing umlauts after metadata...
.\venv\python.exe .\LocalYT-Rev-Files\FixUmlauts.py

echo Generating filedates...
.\venv\python.exe .\LocalYT-Rev-Files\createFiledates.py

echo Removing double spaces...
.\venv\python.exe .\LocalYT-Rev-Files\FixDoubleSpaces.py

echo Generating small thumbnails...
.\venv\python.exe .\LocalYT-Rev-Files\createSmallThumbnails.py

echo Generationg video resolution files...
.\venv\python.exe .\LocalYT-Rev-Files\createVideoresolutions.py

echo Generating filedate cache...
.\venv\python.exe .\LocalYT-Rev-Files\generate_filedate_cache.py

:: Seek Bar Previews Section
if /i "!SEEKBAR_PREVIEWS!"=="yes" (
    echo Generating seek bar previews...
    .\venv\python.exe .\LocalYT-Rev-Files\createSpriteImages.py --workers 1
) else (
    echo Skipping seek bar previews...
)

echo.
echo =============================================================================
echo All metadata, thumbnails and playlists generated. Server is ready for launch.
echo =============================================================================
echo.
pause