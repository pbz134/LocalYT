@echo off
setlocal enabledelayedexpansion

:: Temporarily override PATH to use bundled ffmpeg on all scripts
set "BUNDLED_FFMPEG_DIR=%~dp0LocalYT-Rev-Files\FFmpeg"
set "FFMPEG_AVAILABLE=0"
set "FFPROBE_AVAILABLE=0"
set "MISSING_TOOLS="

:: Check for ffmpeg
where ffmpeg >nul 2>nul
if %errorlevel% equ 0 (
    echo Found ffmpeg in system PATH.
    set "FFMPEG_AVAILABLE=1"
) else (
    echo ffmpeg not found in system PATH.
    if exist "%BUNDLED_FFMPEG_DIR%\ffmpeg.exe" (
        echo Using bundled ffmpeg from %BUNDLED_FFMPEG_DIR%
        set "PATH=%BUNDLED_FFMPEG_DIR%;%PATH%"
        set "FFMPEG_AVAILABLE=1"
    )
)

:: Check for ffprobe
where ffprobe >nul 2>nul
if %errorlevel% equ 0 (
    echo Found ffprobe in system PATH.
    set "FFPROBE_AVAILABLE=1"
) else (
    echo ffprobe not found in system PATH.
    if exist "%BUNDLED_FFMPEG_DIR%\ffprobe.exe" (
        echo Using bundled ffprobe from %BUNDLED_FFMPEG_DIR%
        set "PATH=%BUNDLED_FFMPEG_DIR%;%PATH%"
        set "FFPROBE_AVAILABLE=1"
    )
)

:: Check if both are available
if !FFMPEG_AVAILABLE! equ 0 set "MISSING_TOOLS=ffmpeg"
if !FFPROBE_AVAILABLE! equ 0 (
    if defined MISSING_TOOLS (
        set "MISSING_TOOLS=!MISSING_TOOLS! and ffprobe"
    ) else (
        set "MISSING_TOOLS=ffprobe"
    )
)

if defined MISSING_TOOLS (
    echo.
    echo ================================================================================
    echo ERROR: Required tools are missing: !MISSING_TOOLS!
    echo ================================================================================
    echo.
    echo Neither system PATH nor bundled location contains the required tools:
    echo   System PATH: ffmpeg and ffprobe not found
    echo   Bundled location: %BUNDLED_FFMPEG_DIR%
    echo.
    if !FFMPEG_AVAILABLE! equ 0 echo   - ffmpeg.exe is missing
    if !FFPROBE_AVAILABLE! equ 0 echo   - ffprobe.exe is missing
    echo.
    echo Please ensure the following are available:
    echo   1. Install FFmpeg and add it to your system PATH, OR
    echo   2. Place both ffmpeg.exe and ffprobe.exe in: %BUNDLED_FFMPEG_DIR%
    echo.
    echo Many operations in this script require these tools to function properly.
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

echo All required FFmpeg tools are available.
echo.

:: Clear variables first – we'll read them from file or prompt
set "LLM_TAGGING="
set "SEEKBAR_PREVIEWS="
set "SUBTITLES="
set "THUMBNAIL_MODE="
set "LAUNCH_BROWSER="
set "NEEDS_UPDATE=0"

:: Check if #Setup.env exists
if exist "#Setup.env" (
    echo Found #Setup.env, loading existing preferences...
    for /f "tokens=1,* delims==" %%a in (#Setup.env) do (
        if /i "%%a"=="LLM_TAGGING" set "LLM_TAGGING=%%b"
        if /i "%%a"=="SEEKBAR_PREVIEWS" set "SEEKBAR_PREVIEWS=%%b"
        if /i "%%a"=="SUBTITLES" set "SUBTITLES=%%b"
        if /i "%%a"=="THUMBNAIL_MODE" set "THUMBNAIL_MODE=%%b"
        if /i "%%a"=="LAUNCH_BROWSER" set "LAUNCH_BROWSER=%%b"
    )
    
    :: Check each variable – if any is missing, ask for it
    if not defined SUBTITLES goto ask_subtitles
    if not defined LLM_TAGGING goto ask_llm
    if not defined SEEKBAR_PREVIEWS goto ask_seekbar
    if not defined THUMBNAIL_MODE goto ask_thumbnail
    if not defined LAUNCH_BROWSER goto ask_browser
    
    :: All variables are present – proceed
    goto env_loaded
)

:: ============================================================
:: If file does NOT exist, ask for all from scratch
:: ============================================================
echo #Setup.env not found. Please configure your preferences:

:ask_subtitles_all
set /p "subtitles_choice=Do you want to add subtitles to your videos? (y/n): "
if /i "!subtitles_choice!"=="y" (
    set "SUBTITLES=yes"
) else if /i "!subtitles_choice!"=="n" (
    set "SUBTITLES=no"
) else (
    echo Please enter y or n.
    goto ask_subtitles_all
)

:ask_llm_all
set /p "llm_choice=Do you want to do the LLM video tagging? (y/n): "
if /i "!llm_choice!"=="y" (
    set "LLM_TAGGING=yes"
) else if /i "!llm_choice!"=="n" (
    set "LLM_TAGGING=no"
) else (
    echo Please enter y or n.
    goto ask_llm_all
)

:ask_seekbar_all
set /p "seekbar_choice=Do you want to generate seek bar previews? (y/n): "
if /i "!seekbar_choice!"=="y" (
    set "SEEKBAR_PREVIEWS=yes"
) else if /i "!seekbar_choice!"=="n" (
    set "SEEKBAR_PREVIEWS=no"
) else (
    echo Please enter y or n.
    goto ask_seekbar_all
)

:ask_thumbnail_all
echo Choose an option to fix non-16:9 thumbnails
echo 1. Zoom in to 16:9 (not recommended)
echo 2. Add black borders
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
    goto ask_thumbnail_all
)

:ask_browser_all
set /p "browser_choice=Automatically launch browser when server is ready? (y/n): "
if /i "!browser_choice!"=="y" (
    set "LAUNCH_BROWSER=yes"
) else if /i "!browser_choice!"=="n" (
    set "LAUNCH_BROWSER=no"
) else (
    echo Please enter y or n.
    goto ask_browser_all
)

:: Write all to new file
(
    echo SUBTITLES=!SUBTITLES!
    echo LLM_TAGGING=!LLM_TAGGING!
    echo SEEKBAR_PREVIEWS=!SEEKBAR_PREVIEWS!
    echo THUMBNAIL_MODE=!THUMBNAIL_MODE!
    echo LAUNCH_BROWSER=!LAUNCH_BROWSER!
) > "#Setup.env"

echo Preferences saved to #Setup.env. You won't be asked again.
echo.
goto env_loaded

:: ============================================================
:: Prompt for missing variables (when file exists but lacks some)
:: ============================================================
:ask_subtitles
echo Missing SUBTITLES in #Setup.env.
set /p "subtitles_choice=Do you want to add subtitles to your videos? (y/n): "
if /i "!subtitles_choice!"=="y" (
    set "SUBTITLES=yes"
) else if /i "!subtitles_choice!"=="n" (
    set "SUBTITLES=no"
) else (
    echo Please enter y or n.
    goto ask_subtitles
)
set "NEEDS_UPDATE=1"
goto ask_llm

:ask_llm
if not defined LLM_TAGGING (
    echo Missing LLM_TAGGING in #Setup.env.
    set /p "llm_choice=Do you want to do the LLM video tagging? (y/n): "
    if /i "!llm_choice!"=="y" (
        set "LLM_TAGGING=yes"
    ) else if /i "!llm_choice!"=="n" (
        set "LLM_TAGGING=no"
    ) else (
        echo Please enter y or n.
        goto ask_llm
    )
    set "NEEDS_UPDATE=1"
)
goto ask_seekbar

:ask_seekbar
if not defined SEEKBAR_PREVIEWS (
    echo Missing SEEKBAR_PREVIEWS in #Setup.env.
    set /p "seekbar_choice=Do you want to generate seek bar previews? (y/n): "
    if /i "!seekbar_choice!"=="y" (
        set "SEEKBAR_PREVIEWS=yes"
    ) else if /i "!seekbar_choice!"=="n" (
        set "SEEKBAR_PREVIEWS=no"
    ) else (
        echo Please enter y or n.
        goto ask_seekbar
    )
    set "NEEDS_UPDATE=1"
)
goto ask_thumbnail

:ask_thumbnail
if not defined THUMBNAIL_MODE (
    echo Missing THUMBNAIL_MODE in #Setup.env.
    echo Choose an option to fix non-16:9 thumbnails
    echo 1. Zoom in to 16:9 (not recommended)
    echo 2. Add black borders
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
    set "NEEDS_UPDATE=1"
)
goto ask_browser

:ask_browser
if not defined LAUNCH_BROWSER (
    echo Missing LAUNCH_BROWSER in #Setup.env.
    set /p "browser_choice=Automatically launch browser when server is ready? (y/n): "
    if /i "!browser_choice!"=="y" (
        set "LAUNCH_BROWSER=yes"
    ) else if /i "!browser_choice!"=="n" (
        set "LAUNCH_BROWSER=no"
    ) else (
        echo Please enter y or n.
        goto ask_browser
    )
    set "NEEDS_UPDATE=1"
)

:: If any variables were missing, update the file
if "!NEEDS_UPDATE!"=="1" goto update_env
goto env_loaded

:update_env
:: Preserve existing file, update only the keys, keep other lines
echo Updating #Setup.env with your new preferences...
set "tempfile=%temp%\setup_env_temp.txt"
(
    for /f "usebackq delims=" %%i in ("#Setup.env") do (
        set "line=%%i"
        set "write=1"
        for %%k in (SUBTITLES LLM_TAGGING SEEKBAR_PREVIEWS THUMBNAIL_MODE LAUNCH_BROWSER) do (
            if /i "!line:~0,%%k!"=="%%k=" set "write=0"
        )
        if !write! equ 1 echo !line!
    )
    echo SUBTITLES=!SUBTITLES!
    echo LLM_TAGGING=!LLM_TAGGING!
    echo SEEKBAR_PREVIEWS=!SEEKBAR_PREVIEWS!
    echo THUMBNAIL_MODE=!THUMBNAIL_MODE!
    echo LAUNCH_BROWSER=!LAUNCH_BROWSER!
) > "%tempfile%"
move "%tempfile%" "#Setup.env" >nul
echo.
goto env_loaded

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

echo Adjusting all thumbnails to 16:9...
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

echo Generationg video resolution + codec files...
.\venv\python.exe .\LocalYT-Rev-Files\createVideoresolutions.py

echo Generating filedate cache...
.\venv\python.exe .\LocalYT-Rev-Files\generate_filedate_cache.py

echo Calculating most common channel tags...
.\venv\python.exe .\LocalYT-Rev-Files\createChanneltags.py

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