@echo off

:: Set HF_HOME to current directory
set HF_HOME=%~dp0

:: Try to find hf executable
set HF_EXE=..\..\venv\Scripts\hf.exe
if not exist "%HF_EXE%" set HF_EXE=..\..\venv\python.exe -m huggingface_hub

echo ========================================
echo Faster-Whisper Model Downloader
echo ========================================
echo.
echo Available models:
echo.
echo 1. Medium - vvpreo/systran-faster-whisper-for-HF-endpoint
echo 2. Base   - Systran/faster-whisper-base
echo 3. Large  - Systran/faster-whisper-large-v3
echo 4. Tiny   - Systran/faster-whisper-tiny
echo 5. Small  - Systran/faster-whisper-small
echo 6. Download all models
echo.
echo ========================================
echo.

:ask
set /p choice="Enter your choice (1-6): "

if "%choice%"=="1" goto download_medium
if "%choice%"=="2" goto download_base
if "%choice%"=="3" goto download_large
if "%choice%"=="4" goto download_tiny
if "%choice%"=="5" goto download_small
if "%choice%"=="6" goto download_all
echo Invalid choice. Please enter a number between 1 and 6.
goto ask

:download_medium
echo.
echo Downloading Medium model from vvpreo/systran-faster-whisper-for-HF-endpoint
if not exist "Whisper\Medium" mkdir "Whisper\Medium"
"%HF_EXE%" download vvpreo/systran-faster-whisper-for-HF-endpoint model.bin tokenizer.json vocabulary.txt config.json --local-dir "Whisper\Medium"
echo.
echo Download completed!
goto end

:download_base
echo.
echo Downloading Base model from Systran/faster-whisper-base
if not exist "Whisper\Base" mkdir "Whisper\Base"
"%HF_EXE%" download Systran/faster-whisper-base model.bin tokenizer.json vocabulary.txt config.json --local-dir "Whisper\Base"
echo.
echo Download completed!
goto end

:download_large
echo.
echo Downloading Large model from Systran/faster-whisper-large-v3
if not exist "Whisper\Large" mkdir "Whisper\Large"
"%HF_EXE%" download Systran/faster-whisper-large-v3 model.bin tokenizer.json config.json --local-dir "Whisper\Large"
echo.
echo Download completed!
goto end

:download_tiny
echo.
echo Downloading Tiny model from Systran/faster-whisper-tiny
if not exist "Whisper\Tiny" mkdir "Whisper\Tiny"
"%HF_EXE%" download Systran/faster-whisper-tiny model.bin tokenizer.json vocabulary.txt config.json --local-dir "Whisper\Tiny"
echo.
echo Download completed!
goto end

:download_small
echo.
echo Downloading Small model from Systran/faster-whisper-small
if not exist "Whisper\Small" mkdir "Whisper\Small"
"%HF_EXE%" download Systran/faster-whisper-small model.bin tokenizer.json vocabulary.txt config.json --local-dir "Whisper\Small"
echo.
echo Download completed!
goto end

:download_all
echo.
echo Downloading all models...
echo.
call :download_medium
call :download_base
call :download_large
call :download_tiny
call :download_small
echo All downloads completed!
goto end

:end
echo.
echo ========================================
pause