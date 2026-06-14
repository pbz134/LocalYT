@echo off

:: Set HF_HOME to current directory
set HF_HOME=%~dp0

:: Set Python executable directly
set VENV_PYTHON=..\..\..\venv\python.exe

echo ========================================
echo Faster-Whisper Model Downloader
echo ========================================
echo.
echo Available models:
echo.
echo 1. Medium (Multilingual) - Systran/faster-whisper-medium
echo 2. Base   - Systran/faster-whisper-base-en
echo 3. Large  - Systran/faster-whisper-large-v3
echo 4. Tiny   - Systran/faster-whisper-tiny-en
echo 5. Small  - Systran/faster-whisper-small-en
echo 6. Download all models
echo.
echo ========================================
echo.

:ask
set /p choice="Enter your choice (1-6): "

if "%choice%"=="1" goto download_medium_standard
if "%choice%"=="2" goto download_base_en
if "%choice%"=="3" goto download_large
if "%choice%"=="4" goto download_tiny_en
if "%choice%"=="5" goto download_small_en
if "%choice%"=="6" goto download_all
echo Invalid choice. Please enter a number between 1 and 6.
goto ask

:: Standard Medium (Multilingual)
:download_medium_standard
echo.
echo Downloading Medium (Multilingual) model from Systran/faster-whisper-medium
if not exist "Whisper\Medium" mkdir "Whisper\Medium"
"%VENV_PYTHON%" -c "from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-medium', allow_patterns=['model.bin', 'tokenizer.json', 'vocabulary.txt', 'vocabulary.json', 'config.json'], local_dir=r'Whisper\Medium')"
echo.
echo Download completed!
goto end

:: Base .en
:download_base_en
echo.
echo Downloading Base (.en) model from Systran/faster-whisper-base.en
if not exist "Whisper\Base" mkdir "Whisper\Base"
"%VENV_PYTHON%" -c "from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-base.en', allow_patterns=['model.bin', 'tokenizer.json', 'vocabulary.txt', 'vocabulary.json', 'config.json'], local_dir=r'Whisper\Base')"
echo.
echo Download completed!
goto end

:: Large v3
:download_large
echo.
echo Downloading Large model from Systran/faster-whisper-large-v3
if not exist "Whisper\Large" mkdir "Whisper\Large"
"%VENV_PYTHON%" -c "from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-large-v3', allow_patterns=['model.bin', 'tokenizer.json', 'vocabulary.txt', 'vocabulary.json', 'config.json'], local_dir=r'Whisper\Large')"
echo.
echo Download completed!
goto end

:: Tiny .en
:download_tiny_en
echo.
echo Downloading Tiny (.en) model from Systran/faster-whisper-tiny-en
if not exist "Whisper\Tiny" mkdir "Whisper\Tiny"
"%VENV_PYTHON%" -c "from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-tiny.en', allow_patterns=['model.bin', 'tokenizer.json', 'vocabulary.txt', 'vocabulary.json', 'config.json'], local_dir=r'Whisper\Tiny')"
echo.
echo Download completed!
goto end

:: Small .en
:download_small_en
echo.
echo Downloading Small (.en) model from Systran/faster-whisper-small-en
if not exist "Whisper\Small" mkdir "Whisper\Small"
"%VENV_PYTHON%" -c "from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-small-en', allow_patterns=['model.bin', 'tokenizer.json', 'vocabulary.txt', 'vocabulary.json', 'config.json'], local_dir=r'Whisper\Small')"
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
call :download_small_en
echo All downloads completed!
goto end

:end
echo.
echo ========================================
pause