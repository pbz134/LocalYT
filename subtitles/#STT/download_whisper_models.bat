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
echo 1. Medium (Multilingual) - Systran/faster-whisper-medium
echo 2. Base   - Systran/faster-whisper-base.en
echo 3. Large  - Systran/faster-whisper-large-v3
echo 4. Tiny   - Systran/faster-whisper-tiny.en
echo 5. Small  - Systran/faster-distil-whisper-small.en
echo 6. Distil-Medium (.en) - Systran/faster-distil-whisper-medium.en
echo 7. Download all models
echo.
echo ========================================
echo.

:ask
set /p choice="Enter your choice (1-7): "

if "%choice%"=="1" goto download_medium_standard
if "%choice%"=="2" goto download_base_en
if "%choice%"=="3" goto download_large
if "%choice%"=="4" goto download_tiny_en
if "%choice%"=="5" goto download_distil_small
if "%choice%"=="6" goto download_distil_medium
if "%choice%"=="7" goto download_all
echo Invalid choice. Please enter a number between 1 and 7.
goto ask

:: Standard Medium (Multilingual)
:download_medium_standard
echo.
echo Downloading Medium (Multilingual) model from Systran/faster-whisper-medium
if not exist "Whisper\Medium" mkdir "Whisper\Medium"
:: Downloads both vocab files; HF CLI will skip whichever is missing
"%HF_EXE%" download Systran/faster-whisper-medium model.bin tokenizer.json vocabulary.txt vocabulary.json config.json --local-dir "Whisper\Medium"
echo.
echo Download completed!
goto end

:: Base .en
:download_base_en
echo.
echo Downloading Base (.en) model from Systran/faster-whisper-base.en
if not exist "Whisper\Base" mkdir "Whisper\Base"
"%HF_EXE%" download Systran/faster-whisper-base.en model.bin tokenizer.json vocabulary.txt vocabulary.json config.json --local-dir "Whisper\Base"
echo.
echo Download completed!
goto end

:: Large v3
:download_large
echo.
echo Downloading Large model from Systran/faster-whisper-large-v3
if not exist "Whisper\Large" mkdir "Whisper\Large"
"%HF_EXE%" download Systran/faster-whisper-large-v3 model.bin tokenizer.json vocabulary.txt vocabulary.json config.json --local-dir "Whisper\Large"
echo.
echo Download completed!
goto end

:: Tiny .en
:download_tiny_en
echo.
echo Downloading Tiny (.en) model from Systran/faster-whisper-tiny.en
if not exist "Whisper\Tiny" mkdir "Whisper\Tiny"
"%HF_EXE%" download Systran/faster-whisper-tiny.en model.bin tokenizer.json vocabulary.txt vocabulary.json config.json --local-dir "Whisper\Tiny"
echo.
echo Download completed!
goto end

:: Distil-Small .en
:download_distil_small
echo.
echo Downloading Distil-Small (.en) model from Systran/faster-distil-whisper-small.en
if not exist "Whisper\Small" mkdir "Whisper\Small"
"%HF_EXE%" download Systran/faster-distil-whisper-small.en model.bin tokenizer.json vocabulary.txt vocabulary.json config.json --local-dir "Whisper\Small"
echo.
echo Download completed!
goto end

:: Distil-Medium .en
:download_distil_medium
echo.
echo Downloading Distil-Medium (.en) model from Systran/faster-distil-whisper-medium.en
if not exist "Whisper\DistilMedium" mkdir "Whisper\DistilMedium"
"%HF_EXE%" download Systran/faster-distil-whisper-medium.en model.bin tokenizer.json vocabulary.txt vocabulary.json config.json --local-dir "Whisper\DistilMedium"
echo.
echo Download completed!
goto end

:download_all
echo.
echo Downloading all models...
echo.
call :download_medium_standard
call :download_base_en
call :download_large
call :download_tiny_en
call :download_distil_small
call :download_distil_medium
echo All downloads completed!
goto end

:end
echo.
echo ========================================
pause