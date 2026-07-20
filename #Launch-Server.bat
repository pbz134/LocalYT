@echo off
setlocal enabledelayedexpansion

REM Read from #Setup.env
set "LAUNCH_BROWSER="
if exist "#Setup.env" (
    for /f "usebackq tokens=1,2 delims==" %%a in ("#Setup.env") do (
        if /i "%%a"=="LAUNCH_BROWSER" set "LAUNCH_BROWSER=%%b"
    )
)

REM Ask user if setting doesn't exist in the file
if not defined LAUNCH_BROWSER (
    set /p userInput="Automatically launch browser when server is ready? (Y/N): "
    if /i "!userInput!"=="N" (
        set "LAUNCH_BROWSER=no"
    ) else (
        set "LAUNCH_BROWSER=yes"
    )
    echo LAUNCH_BROWSER=!LAUNCH_BROWSER!>>"#Setup.env"
)

REM If user chose No, relaunch this script minimized to the taskbar
if /i "%LAUNCH_BROWSER%"=="no" (
    if /i not "%~1"=="min" (
        start /min cmd /c "%~f0" min
        exit /b
    )
)

REM Start the server in a new command prompt window with ASCII art
start cmd /k "echo. & echo. & echo       :::        ::::::::   ::::::::      :::     :::     :::   ::: ::::::::::: & echo      :+:       :+:    :+: :+:    :+:   :+: :+:   :+:     :+:   :+:     :+:      & echo     +:+       +:+    +:+ +:+         +:+   +:+  +:+      +:+ +:+      +:+       & echo    +#+       +#+    +:+ +#+        +#++:++#++: +#+       +#++:       +#+        & echo   +#+       +#+    +#+ +#+        +#+     +#+ +#+        +#+        +#+         & echo  #+#       #+#    #+# #+#    #+# #+#     #+# #+#        #+#        #+#          & echo ########## ########   ########  ###     ### ########## ###        ### & echo. & echo. & echo https://github.com/pbz134/LocalYT & npm start"

REM Wait for the server to accept connections (caching/startup)
echo Waiting for server to start...
:wait_loop
ping -n 1 -w 1000 127.0.0.1 >nul
REM Use PowerShell to check if port 3000 is listening. If error, loop again.
powershell -Command "(New-Object Net.Sockets.TcpClient).Connect('127.0.0.1', 3000)" >nul 2>&1
if errorlevel 1 goto wait_loop

REM Small buffer to ensure file handles are released after the cache updates
echo Server is up. Waiting for cache file to fully save...
timeout /t 3 /nobreak >nul

REM Generate home previews after the cache has refreshed
echo Generating home previews...
.\venv\python.exe .\LocalYT-Rev-Files\generate_home_previews.py
echo Preview generation complete.

REM Open the browser only if the user chose Yes
if /i "%LAUNCH_BROWSER%"=="yes" (
    start http://localhost:3000
    echo.
    echo ------------------------------------------------------
    echo You can close this window now.
    pause
) else (
    echo Background tasks complete. Exiting silently...
    timeout /t 3 /nobreak >nul
)