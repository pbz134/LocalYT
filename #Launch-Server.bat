@echo off
REM Start the server in a new command prompt window with ASCII art
start cmd /k "echo. & echo. & echo       :::        ::::::::   ::::::::      :::     :::      :::   ::: ::::::::::: & echo      :+:       :+:    :+: :+:    :+:   :+: :+:   :+:      :+:   :+:     :+: & echo     +:+       +:+    +:+ +:+         +:+   +:+  +:+       +:+ +:+      +:+ & echo    +#+       +#+    +:+ +#+        +#++:++#++: +#+        +#++:       +#+ & echo   +#+       +#+    +#+ +#+        +#+     +#+ +#+         +#+        +#+ & echo  #+#       #+#    #+# #+#    #+# #+#     #+# #+#         #+#        #+# & echo ########## ########   ########  ###     ### ##########  ###        ### & echo. & echo. & npm start"

REM Wait for a few seconds to ensure the server starts
timeout /t 7 /nobreak >nul

REM Open the browser
start http://localhost:3000
