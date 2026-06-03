@echo off
setlocal enabledelayedexpansion

:: ==============================================================================
:: Configuration Defaults (All set to yes by default)
:: ==============================================================================
set "CHANNEL_PICS=yes"
set "CHANNEL_SUBS=yes"
set "RANDOM_SUBCOUNTS=yes"
set "COMMUNITY_POSTS=yes"
set "FIX_COMMENTS=yes"
set "FIX_SUBTITLES=yes"
set "FIX_UMLAUTS=yes"
set "CLEAN_FILENAMES=yes"
set "REMOVE_EMOJIS=yes"
set "THUMBNAILS=yes"
set "VIDEO_STATS=yes"
set "CHANNEL_STATS=yes"
set "VIDEO_LENGTHS=yes"
set "VIEW_COUNTS=yes"
set "SMALL_THUMBNAILS=yes"
set "LLM_TAGGING=yes"
set "PLAYLIST_METADATA=yes"
set "FILENAMES=yes"
set "FILEDATES=yes"
set "FIX_DOUBLE_SPACES=yes"
set "VIDEO_RESOLUTIONS=yes"
set "HOME_PREVIEWS=yes"
set "FILEDATE_CACHE=yes"
set "SEEKBAR_PREVIEWS=yes"

:: ==============================================================================
:: Load or Ask for Preferences
:: ==============================================================================
if exist "#Setup.env" (
    echo Found #Setup.env, loading preferences...
    for /f "tokens=1,* delims==" %%a in (#Setup.env) do (
        if "%%a" neq "" if "%%b" neq "" set "%%a=%%b"
    )
) else (
    echo #Setup.env not found. First-time setup:
    
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

    :: Save ALL choices to #Setup.env so the user can modify them later
    echo CHANNEL_PICS=!CHANNEL_PICS!> "#Setup.env"
    echo CHANNEL_SUBS=!CHANNEL_SUBS!>> "#Setup.env"
    echo RANDOM_SUBCOUNTS=!RANDOM_SUBCOUNTS!>> "#Setup.env"
    echo COMMUNITY_POSTS=!COMMUNITY_POSTS!>> "#Setup.env"
    echo FIX_COMMENTS=!FIX_COMMENTS!>> "#Setup.env"
    echo FIX_SUBTITLES=!FIX_SUBTITLES!>> "#Setup.env"
    echo FIX_UMLAUTS=!FIX_UMLAUTS!>> "#Setup.env"
    echo CLEAN_FILENAMES=!CLEAN_FILENAMES!>> "#Setup.env"
    echo REMOVE_EMOJIS=!REMOVE_EMOJIS!>> "#Setup.env"
    echo THUMBNAILS=!THUMBNAILS!>> "#Setup.env"
    echo VIDEO_STATS=!VIDEO_STATS!>> "#Setup.env"
    echo CHANNEL_STATS=!CHANNEL_STATS!>> "#Setup.env"
    echo VIDEO_LENGTHS=!VIDEO_LENGTHS!>> "#Setup.env"
    echo VIEW_COUNTS=!VIEW_COUNTS!>> "#Setup.env"
    echo SMALL_THUMBNAILS=!SMALL_THUMBNAILS!>> "#Setup.env"
    echo LLM_TAGGING=!LLM_TAGGING!>> "#Setup.env"
    echo PLAYLIST_METADATA=!PLAYLIST_METADATA!>> "#Setup.env"
    echo FILENAMES=!FILENAMES!>> "#Setup.env"
    echo FILEDATES=!FILEDATES!>> "#Setup.env"
    echo FIX_DOUBLE_SPACES=!FIX_DOUBLE_SPACES!>> "#Setup.env"
    echo VIDEO_RESOLUTIONS=!VIDEO_RESOLUTIONS!>> "#Setup.env"
    echo HOME_PREVIEWS=!HOME_PREVIEWS!>> "#Setup.env"
    echo FILEDATE_CACHE=!FILEDATE_CACHE!>> "#Setup.env"
    echo SEEKBAR_PREVIEWS=!SEEKBAR_PREVIEWS!>> "#Setup.env"
    echo.
    echo Preferences saved to #Setup.env. You can edit this file manually to change settings.
    echo.
)

:: ==============================================================================
:: Execute Based on Preferences
:: ==============================================================================

if /i "!CHANNEL_PICS!"=="yes" (
    echo Generating missing channel pictures...
    .\venv\python.exe .\LocalYT-Rev-Files\createChannelpics.py
) else ( echo Skipping channel pictures... )

if /i "!CHANNEL_SUBS!"=="yes" (
    echo Generating missing sub counts...
    .\venv\python.exe .\LocalYT-Rev-Files\createChannelsubs.py
) else ( echo Skipping sub counts... )

if /i "!RANDOM_SUBCOUNTS!"=="yes" (
    echo Randomizing last subcount digits...
    .\venv\python.exe .\LocalYT-Rev-Files\createRandomSubcounts.py
) else ( echo Skipping random subcounts... )

if /i "!COMMUNITY_POSTS!"=="yes" (
    echo Organizing Community posts...
    .\venv\python.exe .\LocalYT-Rev-Files\FormatCommunityPosts.py
) else ( echo Skipping community posts... )

if /i "!FIX_COMMENTS!"=="yes" (
    echo Fixing comment underscores...
    .\venv\python.exe .\LocalYT-Rev-Files\FixCommentUnderscores.py
) else ( echo Skipping comment fixes... )

if /i "!FIX_SUBTITLES!"=="yes" (
    echo Fixing _NA in subtitle file names...
    .\venv\python.exe .\LocalYT-Rev-Files\FixSubNA.py
    echo Deduplicating general English and US English subtitles...
    .\venv\python.exe .\LocalYT-Rev-Files\FixEnglishSubDupes.py
    echo Fixing auto-generated subtitle structuring...
    .\venv\python.exe .\LocalYT-Rev-Files\srt_fixer_cli.py -idir subtitles -odir subtitles
) else ( echo Skipping subtitle fixes... )

if /i "!FIX_UMLAUTS!"=="yes" (
    echo Fixing umlauts before moving metadata...
    .\venv\python.exe .\LocalYT-Rev-Files\FixUmlauts.py --apply
) else ( echo Skipping umlaut fixes... )

if /i "!CLEAN_FILENAMES!"=="yes" (
    echo Cleaning up file names (making 4k Video Downloader file names compatible with yt-dlp file names)...
    .\venv\python.exe .\LocalYT-Rev-Files\remove_special_characters.py
) else ( echo Skipping file name cleanup... )

if /i "!REMOVE_EMOJIS!"=="yes" (
    echo Removing emojis from file names...
    .\venv\python.exe .\LocalYT-Rev-Files\remove_emojis.py
) else ( echo Skipping emoji removal... )

if /i "!THUMBNAILS!"=="yes" (
    echo Generating thumbnails...
    .\venv\python.exe .\LocalYT-Rev-Files\createThumbnails.py
) else ( echo Skipping thumbnail generation... )

if /i "!VIDEO_STATS!"=="yes" (
    echo Generating video stats...
    .\venv\python.exe .\LocalYT-Rev-Files\createVideostats.py
) else ( echo Skipping video stats... )

if /i "!CHANNEL_STATS!"=="yes" (
    echo Calculating total channel view counts and archived date...
    .\venv\python.exe .\LocalYT-Rev-Files\createChannelstats.py
) else ( echo Skipping channel stats... )

if /i "!VIDEO_LENGTHS!"=="yes" (
    echo Generating videolengths...
    .\venv\python.exe .\LocalYT-Rev-Files\createVideolengths.py
    goto continue
) else ( 
    echo Skipping video length generation...
    goto continue
)

:continue
if /i "!VIEW_COUNTS!"=="yes" (
    echo Generating view counts...
    .\venv\python.exe .\LocalYT-Rev-Files\createviews.py
) else ( echo Skipping view counts... )

if /i "!SMALL_THUMBNAILS!"=="yes" (
    echo Generating small thumbnails...
    .\venv\python.exe .\LocalYT-Rev-Files\createSmallThumbnails.py
) else ( echo Skipping small thumbnails... )

:: LLM Video Tagging Section
if /i "!LLM_TAGGING!"=="yes" (
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
) else (
    echo Skipping LLM video tagging...
)

if /i "!PLAYLIST_METADATA!"=="yes" (
    echo Organizing playlist metadata...
    .\venv\python.exe .\LocalYT-Rev-Files\MovePlaylistMetadata.py
) else ( echo Skipping playlist metadata... )

if /i "!FILENAMES!"=="yes" (
    echo Generating filenames...
    .\venv\python.exe .\LocalYT-Rev-Files\createFilenames.py
) else ( echo Skipping filenames... )

if /i "!FIX_UMLAUTS!"=="yes" (
    echo Fixing umlauts after metadata...
    .\venv\python.exe .\LocalYT-Rev-Files\FixUmlauts.py
) else ( echo Skipping umlaut fixes... )

if /i "!FILEDATES!"=="yes" (
    echo Generating filedates...
    .\venv\python.exe .\LocalYT-Rev-Files\createFiledates.py
) else ( echo Skipping filedates... )

if /i "!FIX_DOUBLE_SPACES!"=="yes" (
    echo Removing double spaces...
    .\venv\python.exe .\LocalYT-Rev-Files\FixDoubleSpaces.py
) else ( echo Skipping double space fixes... )

if /i "!VIDEO_RESOLUTIONS!"=="yes" (
    echo Generationg video resolution files...
    .\venv\python.exe .\LocalYT-Rev-Files\createVideoresolutions.py
) else ( echo Skipping video resolutions... )

if /i "!HOME_PREVIEWS!"=="yes" (
    echo Generating channel Home page index...
    .\venv\python.exe .\LocalYT-Rev-Files\generate_home_previews.py
) else ( echo Skipping home previews... )

if /i "!FILEDATE_CACHE!"=="yes" (
    echo Generating filedate cache...
    .\venv\python.exe .\LocalYT-Rev-Files\generate_filedate_cache.py
) else ( echo Skipping filedate cache... )

if /i "!SEEKBAR_PREVIEWS!"=="yes" (
    echo Generating seek bar previews...
    .\venv\python.exe .\LocalYT-Rev-Files\createSpriteImages.py --workers 1
) else ( echo Skipping seek bar previews... )

echo.
echo =============================================================================
echo All metadata, thumbnails and playlists generated. Server is ready for launch.
echo =============================================================================
echo.
pause