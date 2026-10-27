@echo off
setlocal

REM Hide THIS launcher window (the server window below still shows).
if /i not "%~1"=="hidden" (
    >"%TEMP%\lyt_hide.vbs" echo Set sh = CreateObject^("WScript.Shell"^)
    >>"%TEMP%\lyt_hide.vbs" echo q = Chr^(34^)
    >>"%TEMP%\lyt_hide.vbs" echo sh.Run q ^& "%~f0" ^& q ^& " hidden", 0, False
    wscript //nologo "%TEMP%\lyt_hide.vbs"
    del "%TEMP%\lyt_hide.vbs" >nul 2>&1
    exit /b
)

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

set "USE_INTEGRATED_NODE=yes"
set "NODE_PATH=%SCRIPT_DIR%\LocalYT-Rev-Files\nodejs\node.exe"
set "LAUNCH_BROWSER=yes"

if exist "%SCRIPT_DIR%\#Setup.env" (
    for /f "usebackq tokens=1,2 delims==" %%a in ("%SCRIPT_DIR%\#Setup.env") do (
        if /i "%%a"=="LAUNCH_BROWSER" set "LAUNCH_BROWSER=%%b"
        if /i "%%a"=="NODE_PATH" set "NODE_PATH=%%b"
        if /i "%%a"=="USE_INTEGRATED_NODE" set "USE_INTEGRATED_NODE=%%b"
    )
)

if not "%NODE_PATH%"=="%NODE_PATH:%%SCRIPT_DIR%%=%" (
    set "NODE_PATH=!NODE_PATH:%%SCRIPT_DIR%%=%SCRIPT_DIR%!"
)

if /i "%USE_INTEGRATED_NODE%"=="yes" (
    if exist "%NODE_PATH%" (
        set "NODE_CMD=%NODE_PATH%"
    ) else (
        set "NODE_CMD=node"
        set "USE_INTEGRATED_NODE=no"
    )
) else (
    set "NODE_CMD=node"
)

if /i "%USE_INTEGRATED_NODE%"=="no" (
    where node >nul 2>&1
    if errorlevel 1 (
        mshta "javascript:alert('ERROR: Node.js not found in PATH.');close()"
        exit /b 1
    )
)

REM ============================================================
REM Launch the VISIBLE server window with ASCII art + node.
REM ============================================================
start "LocalYT Server" cmd /c "echo. & echo       :::        ::::::::   ::::::::      :::     :::     :::   ::: ::::::::::: & echo      :+:       :+:    :+: :+:    :+:   :+: :+:   :+:     :+:   :+:     :+:      & echo     +:+       +:+    +:+ +:+         +:+   +:+  +:+      +:+ +:+      +:+       & echo    +#+       +#+    +#+ +#+        +#++:++#++: +#+       +#++:       +#+        & echo   +#+       +#+    +#+ +#+        +#+     +#+ +#+        +#+        +#+         & echo  #+#       #+#    #+# #+#    #+# #+#     #+# #+#        #+#        #+#          & echo ########## ########   ########  ###     ### ########## ###        ### & echo. & echo. & echo https://github.com/pbz134/LocalYT & echo. & echo Using Node: %NODE_CMD% & %NODE_CMD% server.js"

REM Wait for server to accept connections (silent — no window)
:wait_loop
ping -n 1 -w 1000 127.0.0.1 >nul
powershell -NoProfile -Command "(New-Object Net.Sockets.TcpClient).Connect('127.0.0.1', 3000)" >nul 2>&1
if errorlevel 1 goto wait_loop

REM Cache-file buffer
timeout /t 3 /nobreak >nul

REM Open browser
if /i "%LAUNCH_BROWSER%"=="yes" (
    start http://localhost:3000
)

endlocal
exit /b 0