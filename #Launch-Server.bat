@echo off
setlocal enabledelayedexpansion

REM Get the script's directory
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

REM Defaults (integrated Node)
set "USE_INTEGRATED_NODE=yes"
set "NODE_PATH=%SCRIPT_DIR%\LocalYT-Rev-Files\nodejs\node.exe"
set "LAUNCH_BROWSER=yes"

REM Read from #Setup.env – override defaults if present
if exist "%SCRIPT_DIR%\#Setup.env" (
    for /f "usebackq tokens=1,2 delims==" %%a in ("%SCRIPT_DIR%\#Setup.env") do (
        if /i "%%a"=="LAUNCH_BROWSER" set "LAUNCH_BROWSER=%%b"
        if /i "%%a"=="NODE_PATH" set "NODE_PATH=%%b"
        if /i "%%a"=="USE_INTEGRATED_NODE" set "USE_INTEGRATED_NODE=%%b"
    )
)

REM Expand portable placeholder if needed
if not "%NODE_PATH%"=="%NODE_PATH:%%SCRIPT_DIR%%=%" (
    set "NODE_PATH=!NODE_PATH:%%SCRIPT_DIR%%=%SCRIPT_DIR%!"
)

REM Determine final node command with fallback
if /i "%USE_INTEGRATED_NODE%"=="yes" (
    REM Check if integrated node.exe exists
    if exist "%NODE_PATH%" (
        set "NODE_CMD=%NODE_PATH%"
        echo Using integrated Node.js: %NODE_PATH%
    ) else (
        echo WARNING: Integrated Node.js not found at: %NODE_PATH%
        echo Falling back to system Node.js...
        set "NODE_CMD=node"
        set "USE_INTEGRATED_NODE=no"
    )
) else (
    set "NODE_CMD=node"
    echo Using system Node.js
)

REM Verify system Node is available if using it
if /i "%USE_INTEGRATED_NODE%"=="no" (
    where node >nul 2>&1
    if errorlevel 1 (
        echo ERROR: System Node.js not found in PATH!
        echo Please install Node.js or check your PATH configuration.
        echo.
        echo Press any key to exit...
        pause >nul
        exit /b 1
    )
)

REM If browser launch is set to "no", relaunch minimized (original behaviour)
if /i "%LAUNCH_BROWSER%"=="no" (
    if /i not "%~1"=="min" (
        start /min cmd /c "%~f0" min
        exit /b
    )
)

REM Start the server in a new window
start cmd /k "echo. & echo. & echo       :::        ::::::::   ::::::::      :::     :::     :::   ::: ::::::::::: & echo      :+:       :+:    :+: :+:    :+:   :+: :+:   :+:     :+:   :+:     :+:      & echo     +:+       +:+    +:+ +:+         +:+   +:+  +:+      +:+ +:+      +:+       & echo    +#+       +#+    +#+ +#+        +#++:++#++: +#+       +#++:       +#+        & echo   +#+       +#+    +#+ +#+        +#+     +#+ +#+        +#+        +#+         & echo  #+#       #+#    #+# #+#    #+# #+#     #+# #+#        #+#        #+#          & echo ########## ########   ########  ###     ### ########## ###        ### & echo. & echo. & echo https://github.com/pbz134/LocalYT & echo Using Node: %NODE_CMD% & %NODE_CMD% server.js"

REM Wait for server to accept connections
echo Waiting for server to start...
:wait_loop
ping -n 1 -w 1000 127.0.0.1 >nul
powershell -Command "(New-Object Net.Sockets.TcpClient).Connect('127.0.0.1', 3000)" >nul 2>&1
if errorlevel 1 goto wait_loop

REM Small buffer for cache
echo Server is up. Waiting for cache file to fully save...
timeout /t 3 /nobreak >nul

REM Generate home previews
echo Generating home previews...
"%SCRIPT_DIR%\venv\python.exe" "%SCRIPT_DIR%\LocalYT-Rev-Files\generate_home_previews.py"
echo Preview generation complete.

REM Open browser if configured
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