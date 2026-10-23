@echo off
setlocal EnableExtensions

rem ------------------------------------------------------------------
rem This script lives in ...\LocalYT-Debug\, thumbnails is a sibling:
rem   ...\LocalYT-Debug\  (script)
rem   ...\thumbnails\     (target)
rem %~dp0 always ends with a backslash, so "%~dp0..\thumbnails" works
rem no matter where the LocalYT folder is copied to.
rem ------------------------------------------------------------------
set "THUMB_DIR=%~dp0..\thumbnails"

rem --- Sanity check ---------------------------------------------------
if not exist "%THUMB_DIR%\" (
    echo [ERROR] Thumbnails directory not found:
    echo         "%THUMB_DIR%"
    echo.
    pause
    exit /b 1
)

rem Normalize the path (resolve the "..")
for %%I in ("%THUMB_DIR%") do set "THUMB_DIR=%%~fI"

rem --- Count matching files (informational) ---------------------------
set "COUNT=0"
for /f "delims=" %%F in ('
    dir /s /b /a-d "%THUMB_DIR%\*.vtt" "%THUMB_DIR%\*SpriteImg.jpg" "%THUMB_DIR%\*.nosprite" 2^>nul
') do set /a COUNT+=1

rem --- Confirmation prompt --------------------------------------------
echo ============================================================
echo  Cleanup target : %THUMB_DIR%
echo  Will delete    : *.vtt  ^|  *SpriteImg.jpg  ^|  *.nosprite
echo  Scope          : recursive (all subfolders)
echo  Files found    : %COUNT%
echo ============================================================
echo.

if "%COUNT%"=="0" (
    echo Nothing to delete.
    echo.
    pause
    exit /b 0
)

set "ANSWER="
set /p "ANSWER=Proceed with deletion? [y/N]: "
if /i not "%ANSWER%"=="y" (
    echo.
    echo Cancelled. Nothing was deleted.
    echo.
    pause
    exit /b 0
)

rem --- Do the deletion -------------------------------------------------
pushd "%THUMB_DIR%" || (
    echo [ERROR] Could not enter "%THUMB_DIR%".
    pause
    exit /b 1
)

del /s /q *.vtt
del /s /q *SpriteImg.jpg
del /s /q *.nosprite

popd

echo.
echo Done. %COUNT% file^(s^) processed.
echo.
pause
endlocal