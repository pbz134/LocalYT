@echo off
setlocal

echo Bcrypt Password Hash Generator
echo ------------------------------
echo Use this if you or a user forgot their password
echo Or if you simply want to change your password
echo without logging in to LocalYT
echo ------------------------------
echo.

:: Check if Node is available
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo         This script requires Node.js since bcrypt is already available.
    pause
    exit /b 1
)

set /p "PASSWORD=Enter new password: "

if "%PASSWORD%"=="" (
    echo [ERROR] Password cannot be empty.
    pause
    exit /b 1
)

echo.
echo Generating hash...

node -e "const bcrypt = require('bcrypt'); bcrypt.hash(process.argv[1], 10).then(h => console.log(h));" "%PASSWORD%"

echo Copy the hash above and paste it into users.json replacing the old password value.

pause