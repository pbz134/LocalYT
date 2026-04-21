@echo off
REM Start the server in a new command prompt window with ASCII art
start cmd /k "echo. & echo. & echo       :::        ::::::::   ::::::::      :::     :::      :::   ::: ::::::::::: & echo      :+:       :+:    :+: :+:    :+:   :+: :+:   :+:      :+:   :+:     :+: & echo     +:+       +:+    +:+ +:+         +:+   +:+  +:+       +:+ +:+      +:+ & echo    +#+       +#+    +:+ +#+        +#++:++#++: +#+        +#++:       +#+ & echo   +#+       +#+    +#+ +#+        +#+     +#+ +#+         +#+        +#+ & echo  #+#       #+#    #+# #+#    #+# #+#     #+# #+#         #+#        #+# & echo ########## ########   ########  ###     ### ##########  ###        ### & echo. & echo. & echo https://github.com/pbz134/LocalYT & npm start"

REM Wait for the server to accept connections (caching/startup)
echo Waiting for server to start...
REM This loop checks localhost (127.0.0.1) on port 3000 every 1 second.
:wait_loop
ping -n 1 -w 1000 127.0.0.1 >nul
REM Use PowerShell to check if port 3000 is listening. If error, loop again.
powershell -Command "(New-Object Net.Sockets.TcpClient).Connect('127.0.0.1', 3000)" >nul 2>&1
if errorlevel 1 goto wait_loop

REM Open the browser only after the connection is successful
start http://localhost:3000