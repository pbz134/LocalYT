@echo off
setlocal enabledelayedexpansion

REM Check if yt-dlp.exe exists
if not exist "yt-dlp.exe" (
    echo yt-dlp.exe not found. Please ensure yt-dlp.exe is in the same directory as this script.
    pause
    exit /b 1
)

:menu
cls
echo ==========================================
echo      YouTube Link Downloader Tool
echo ==========================================
echo.
echo  1. Get links from a Channel
echo  2. Get links from a Playlist
echo.
set /p "mode=Select mode (1 or 2): "

REM Validate input
if "%mode%"=="1" goto get_input
if "%mode%"=="2" goto get_input
echo Invalid selection. Please try again.
timeout /t 2 >nul
goto menu

:get_input
echo.
set /p "url=Enter the YouTube URL: "
set /p "output_file=Enter the output filename (without .txt): "

REM Ensure the filename ends with .txt
if /I not "%output_file:~-4%"==".txt" set "output_file=%output_file%.txt"

echo.
echo Processing, please wait...

if "%mode%"=="1" (
    REM --- Channel Logic ---
    REM Uses yt-dlp to get IDs and print them as full URLs directly.
    REM This replaces the slow loop method from the original script.
    yt-dlp.exe --flat-playlist --print "https://www.youtube.com/watch?v=%%(id)s" "%url%" > "%output_file%"
    
    echo Done! Channel video links saved to %output_file%
) else (
    REM --- Playlist Logic ---
    REM Uses the specific logic from the second script, including -i to ignore errors.
    yt-dlp.exe --flat-playlist -i --print-to-file "%%(url)s" "%output_file%" "%url%"
    
    echo Done! Playlist links saved to %output_file%
)

echo.
pause
endlocal