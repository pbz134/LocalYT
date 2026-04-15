#!/usr/bin/env python3
import os
import sys
import subprocess
import time
import json
import re
from pathlib import Path

# ==========================================
# CONFIGURATION
# ==========================================

SCRIPT_DIR = Path(__file__).parent.resolve()
ROOT_DIR = SCRIPT_DIR.parent.parent

VENVPYTHON = ROOT_DIR / "venv" / "python.exe"
WHISPER_EXE = ROOT_DIR / "venv" / "Scripts" / "whisper-ctranslate2.exe"
VIDEOS_DIR = ROOT_DIR / "videos"
SUBTITLES_DIR = ROOT_DIR / "subtitles"

# ==========================================
# LOCAL MODEL CONFIGURATION
# ==========================================

LOCAL_MODEL_BASE_DIR = SCRIPT_DIR / "Whisper"

AVAILABLE_MODELS = {
    'tiny':   {'speed': '10x', 'vram': '0.5GB', 'desc': 'Fastest, medium accuracy'},
    'base':   {'speed': '7x', 'vram': '0.7GB', 'desc': 'Fast, good accuracy'},
    'small':  {'speed': '4x',  'vram': '1GB',   'desc': 'Best speed/accuracy balance'},
    'medium': {'speed': '2x',  'vram': '2.5GB', 'desc': 'Slower, suitable for non-English'},
    'large':  {'speed': '1x',  'vram': '5GB',   'desc': 'Slowest, highest accuracy'},
}

# Language code mapping: Whisper code -> filename suffix
LANGUAGE_SUFFIX_MAP = {
    'en': 'en-US',
    'de': 'de',
    'fr': 'fr',
    'es': 'es',
    'it': 'it',
    'pt': 'pt',
    'nl': 'nl',
    'pl': 'pl',
    'ru': 'ru',
    'ja': 'ja',
    'ko': 'ko',
    'zh': 'zh-CN',
    'yue': 'zh-HK',
    'ar': 'ar',
    'hi': 'hi',
    'tr': 'tr',
    'sv': 'sv',
    'da': 'da',
    'no': 'no',
    'fi': 'fi',
    'cs': 'cs',
    'hu': 'hu',
    'ro': 'ro',
    'uk': 'uk',
    'vi': 'vi',
    'th': 'th',
    'id': 'id',
    'ms': 'ms',
    # Fallback for unknown languages
    'default': 'und',
}

PROGRESS_UPDATE_INTERVAL = 0.5

def find_model_directory(model_name='small'):
    """Find the Whisper model directory for a specific model size."""
    target_dir = LOCAL_MODEL_BASE_DIR / model_name.capitalize()
    
    if target_dir.exists() and target_dir.is_dir():
        if (target_dir / "model.bin").exists() or (target_dir / "config.json").exists():
            return target_dir
            
    return None

def format_duration(seconds):
    """Format seconds into human-readable duration"""
    if seconds < 60:
        return f"{seconds:.1f}s"
    elif seconds < 3600:
        return f"{int(seconds // 60)}m {int(seconds % 60):02d}s"
    else:
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        return f"{hours}h {minutes:02d}m"

def format_file_size(bytes_size):
    """Format bytes into human-readable size"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_size < 1024.0:
            return f"{bytes_size:.1f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.1f} TB"

def print_progress_bar(current, total, prefix='', suffix='', length=40):
    """Print a progress bar to console"""
    if total == 0:
        percent = 100.0
        filled = length
    else:
        percent = (current / total) * 100
        filled = int(length * current // total)
    
    bar = '█' * filled + '-' * (length - filled)
    
    if total > 0:
        sys.stdout.write(f'\r{prefix} |{bar}| {percent:5.1f}% {suffix}')
    else:
        sys.stdout.write(f'\r{prefix} |{bar}| {suffix}')
    sys.stdout.flush()

def get_video_duration(file_path):
    """Get video/audio duration using ffprobe"""
    try:
        cmd = [
            'ffprobe', '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            str(file_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            return float(result.stdout.strip())
    except:
        pass
    
    try:
        size_mb = file_path.stat().st_size / (1024 * 1024)
        return size_mb * 60
    except:
        return 0

def print_header():
    """Print the program header"""
    print("=" * 60)
    print("      LOCALYT SUBTITLE PROCESSOR")
    print("=" * 60)
    print()

def check_venv():
    """Verify Python venv exists"""
    if not VENVPYTHON.exists():
        print(f"ERROR: Python venv not found at {VENVPYTHON}")
        input("\nPress Enter to exit...")
        sys.exit(1)

def get_user_choice():
    """Get user's menu selection"""
    print("[A] Process ALL channels")
    print("[S] Process Specific Channel")
    print()
    
    while True:
        choice = input("Please select an option (A/S): ").strip().upper()
        if choice in ['A', 'S']:
            return choice
        print("Invalid choice. Please enter A or S.")

def get_task_choice():
    """Ask user whether to transcribe or translate"""
    print()
    print("Select Processing Mode:")
    print("[1] Transcribe (Keep original language)")
    print("[2] Translate (Translate to English)")
    print()
    
    while True:
        choice = input("Please select an option (1/2): ").strip()
        if choice == '1':
            return "transcribe"
        elif choice == '2':
            return "translate"
        print("Invalid choice. Please enter 1 or 2.")


def get_target_language_suffix(task_mode):
    """
    Ask user for target language suffix.
    
    For translate mode: What language to translate TO (default: en)
    For transcribe mode: What suffix to use for output (e.g., 'de' for German)
    
    Returns: language suffix string (e.g., 'de', 'en-US', 'fr') or None
    """
    print()
    print("=" * 60)
    
    if task_mode == "translate":
        print("TRANSLATION TARGET LANGUAGE")
        print("=" * 60)
        print()
        print("Whisper translates to ENGLISH by default.")
        print("Enter a suffix for the output filename:")
        print()
    else:
        print("OUTPUT LANGUAGE SUFFIX")
        print("=" * 60)
        print()
        print("Specify the language code for the subtitle filename.")
        print("This helps organize multi-language subtitles.")
        print()
    
    print("Common options:")
    print("  de     German")
    print("  en-US  English (US)")
    print("  en     English (generic)")
    print("  fr     French")
    print("  es     Spanish")
    print("  it     Italian")
    print("  ja     Japanese")
    print("  ko     Korean")
    print("  zh-CN  Chinese (Simplified)")
    print("  ru     Russian")
    print("  pt     Portuguese")
    print("  nl     Dutch")
    print("  pl     Polish")
    print("  ar     Arabic")
    print("  hi     Hindi")
    print()
    print("Or press Enter to auto-detect from audio (transcribe only)")
    print()
    
    while True:
        user_input = input("Enter language suffix (or Enter for auto-detect): ").strip()
        
        if not user_input:
            if task_mode == "translate":
                # Translate mode defaults to 'en' if not specified
                print("   Defaulting to: en (English translation)")
                return "en"
            else:
                # Transcribe mode: None means auto-detect + check if ANY subtitle exists
                print("   Will auto-detect language from audio content")
                return None
        
        # Validate input (basic sanity check)
        if len(user_input) <= 10 and re.match(r'^[a-zA-Z0-9-]+$', user_input):
            print(f"   ✓ Using suffix: {user_input}")
            return user_input.lower()
        else:
            print("   Invalid format. Use letters, numbers, and hyphens only (max 10 chars).")


def get_model_choice():
    """Ask user which model to use"""
    print()
    print("Select AI Model:")
    print("-" * 60)
    keys = ['tiny', 'base', 'small', 'medium', 'large']
    valid_keys = {}
    
    idx = 1
    for key in keys:
        info = AVAILABLE_MODELS[key]
        print(f"[{idx}] {key.upper()}: {info['desc']}")
        print(f"    Speed: ~{info['speed']} real-time | VRAM: {info['vram']}")
        valid_keys[str(idx)] = key
        idx += 1
        
    print("-" * 60)
    
    while True:
        choice = input("Please select a model (1-5): ").strip()
        if choice in valid_keys:
            return valid_keys[choice]
        print("Invalid choice. Please enter a number between 1 and 5.")

def list_channels():
    """List all available channel directories"""
    if not VIDEOS_DIR.exists():
        print(f"ERROR: Videos directory not found: {VIDEOS_DIR}")
        return []
    
    channels = sorted([d.name for d in VIDEOS_DIR.iterdir() if d.is_dir()])
    return channels

def get_channel_name(channels):
    """Prompt user to select a channel by name"""
    print()
    print("Available Channels:")
    print("-" * 50)
    
    for channel in channels:
        print(f"  {channel}")
    print("-" * 50)
    print()
    
    while True:
        channel_name = input("Enter Channel Name: ").strip()
        
        if not channel_name:
            print("Error: Please enter a channel name.")
            continue
        
        target_dir = VIDEOS_DIR / channel_name
        
        if target_dir.exists():
            return channel_name, target_dir
        else:
            matches = [c for c in channels if c.lower() == channel_name.lower()]
            if matches:
                print(f"Found similar channel: '{matches[0]}'")
                use_match = input(f"Use '{matches[0]}' instead? (y/n): ").strip().lower()
                if use_match == 'y':
                    return matches[0], VIDEOS_DIR / matches[0]
            
            print(f"\nError: Channel folder not found: {channel_name}")
            print()

def should_skip_file(filename, ext):
    """Determine if a file should be skipped"""
    filename_lower = filename.lower()
    
    if 'no talking' in filename_lower:
        return True, "Contains 'no talking'"
    
    remix_keywords = ['remix', 'bootleg', 'booty', 'cover']
    for keyword in remix_keywords:
        if keyword in filename_lower:
            return True, f"Contains '{keyword}'"
    
    if ext.lower() == '.mp3' and 'asmr' not in filename_lower:
        return True, "MP3 without ASMR tag"
    
    return False, ""

def find_videos_needing_subtitles(target_dir, target_language_suffix=None):
    """
    Scan for files needing subtitle generation.
    
    Args:
        target_dir: Directory to scan for videos
        target_language_suffix: If specified, only check if THIS specific 
                               language subtitle is missing.
                               If None, check if ANY subtitle exists (original behavior).
    
    Returns:
        List of file paths needing subtitle generation
    """
    files_to_process = []
    
    video_extensions = {'.mp4', '.mkv'}
    audio_extensions = {'.mp3'}
    all_extensions = video_extensions | audio_extensions
    
    print(f"\nScanning: {target_dir}")
    
    if target_language_suffix:
        print(f"Checking for missing [{target_language_suffix}] subtitles...")
    else:
        print("Checking for existing subtitles...")
    print()
    
    for file_path in target_dir.rglob('*'):
        if not file_path.is_file():
            continue
        
        ext = file_path.suffix.lower()
        if ext not in all_extensions:
            continue
        
        filename = file_path.stem
        
        skip, reason = should_skip_file(filename, ext)
        if skip:
            print(f"  [SKIP] {file_path.name} ({reason})")
            continue
        
        rel_path = file_path.relative_to(VIDEOS_DIR)
        sub_parent = SUBTITLES_DIR / rel_path.parent
        
        # Determine if this specific file needs processing
        needs_processing = False
        existing_langs = []
        
        if sub_parent.exists():
            # Find all existing VTT variants for this video
            # Matches: filename.vtt, filename.en-US.vtt, filename.de.vtt, etc.
            pattern = f"{filename}*.vtt"
            existing_subs = list(sub_parent.glob(pattern))
            
            for sub_file in existing_subs:
                # Extract language suffix from filename (e.g., "video.en-US.vtt" -> "en-US")
                sub_stem = sub_file.stem  # "video.en-US"
                
                if sub_stem == filename:
                    # This is "video.vtt" (no suffix) - treat as generic/unknown
                    existing_langs.append("(none)")
                elif sub_stem.startswith(filename + "."):
                    # Has language suffix: "video.en-US" -> "en-US"
                    lang_suffix = sub_stem[len(filename) + 1:]  # Skip "video."
                    existing_langs.append(lang_suffix)
            
            # Check if we need to generate subtitles
            if target_language_suffix:
                # Specific mode: Only process if THIS language is missing
                if target_language_suffix not in existing_langs:
                    needs_processing = True
                else:
                    print(f"  [OK]   {file_path.name} (.{target_language_suffix}.vtt exists)")
            else:
                # Generic mode: Process if NO subtitles exist at all
                if not existing_subs:
                    needs_processing = True
                else:
                    langs_str = ", ".join(existing_langs) if existing_langs else "(none)"
                    print(f"  [OK]   {file_path.name} (has [{langs_str}] subtitle)")
        
        else:
            # No subtitle directory at all - definitely needs processing
            needs_processing = True
        
        if needs_processing:
            files_to_process.append(file_path)
            
            file_size = file_path.stat().st_size
            duration = get_video_duration(file_path)
            
            if target_language_suffix:
                print(f"  [QUEUE] {file_path.name} → needs .{target_language_suffix}.vtt")
            else:
                print(f"  [QUEUE] {file_path.name}")
            print(f"          Size: {format_file_size(file_size)} | Duration: ~{format_duration(duration)}")
    
    return files_to_process

class ProgressTracker:
    """Track and display processing progress"""
    
    def __init__(self, file_index, total_files, file_path):
        self.file_index = file_index
        self.total_files = total_files
        self.file_path = file_path
        self.file_name = file_path.name
        self.start_time = time.time()
        self.process_start = None
        self.last_update = 0
        self.file_size = file_path.stat().st_size
        self.duration = get_video_duration(file_path)
        
    def start_processing(self):
        """Mark the start of processing"""
        self.process_start = time.time()
        
        print(f"\n{'='*70}")
        print(f"FILE [{self.file_index}/{self.total_files}]: {self.file_name}")
        print(f"   Size: {format_file_size(self.file_size)} | Duration: ~{format_duration(self.duration)}")
        print(f"{'='*70}")
        print()
        
    def update(self, force=False):
        """Update progress display"""
        current_time = time.time()
        elapsed = current_time - self.process_start
        
        if not force and (current_time - self.last_update) < PROGRESS_UPDATE_INTERVAL:
            return
        
        self.last_update = current_time
        
        elapsed_str = format_duration(elapsed)
        
        if self.duration > 0:
            estimated_total = self.duration / 0.8
            progress = min(elapsed / estimated_total, 0.99)
            
            if progress > 0:
                eta = (elapsed / progress) - elapsed
                eta_str = format_duration(eta)
            else:
                eta_str = "calculating..."
            
            print_progress_bar(
                progress,
                1.0,
                prefix=f'Elapsed: {elapsed_str}',
                suffix=f'| ETA: {eta_str}',
                length=30
            )
        else:
            sys.stdout.write(f'\rElapsed: {elapsed_str} | Processing...     ')
            sys.stdout.flush()
    
    def complete(self, success, output_file=None):
        """Mark processing as complete"""
        elapsed = time.time() - self.process_start
        
        print()  # New line after progress bar
        
        status_icon = "[OK]" if success else "[FAIL]"
        status_text = "SUCCESS" if success else "FAILED"
        
        print(f"\n{status_icon} {status_text}")
        print(f"   Total time: {format_duration(elapsed)}")
        
        if output_file and output_file.exists():
            output_size = output_file.stat().st_size
            print(f"   Output: {output_file.name} ({format_file_size(output_size)})")
        
        if success and self.duration > 0:
            speed_ratio = self.duration / elapsed if elapsed > 0 else 0
            print(f"   Processing speed: {speed_ratio:.2f}x real-time")
        
        print()


def detect_language_from_json(json_file):
    """
    Detect language from whisper JSON output.
    Returns (language_code: str, confidence: float)
    """
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Method 1: Check top-level 'language' field
        if 'language' in data:
            lang = data['language'].lower()
            return lang, 1.0
        
        # Method 2: Check first segment's language
        if 'segments' in data and len(data['segments']) > 0:
            first_seg = data['segments'][0]
            if 'language' in first_seg:
                lang = first_seg['language'].lower()
                return lang, 1.0
            
            # Some versions put it in nested structure
            if 'text' in first_seg:
                # Try to detect from content heuristics
                text = first_seg.get('text', '')
                # This is a fallback - usually language is explicitly provided
                pass
        
        return None, 0.0
        
    except Exception as e:
        print(f"   Warning: Could not parse JSON for language detection: {e}")
        return None, 0.0


def get_language_suffix(language_code):
    """
    Convert Whisper language code to filename suffix.
    Examples: 'en' -> 'en-US', 'de' -> 'de', 'zh' -> 'zh-CN'
    """
    if not language_code:
        return LANGUAGE_SUFFIX_MAP['default']
    
    # Normalize: lowercase, handle variants like 'english' -> 'en'
    lang_lower = language_code.lower().strip()
    
    # Direct lookup
    if lang_lower in LANGUAGE_SUFFIX_MAP:
        return LANGUAGE_SUFFIX_MAP[lang_lower]
    
    # Handle full language names that whisper sometimes returns
    lang_name_map = {
        'english': 'en',
        'german': 'de',
        'french': 'fr',
        'spanish': 'es',
        'chinese': 'zh',
        'japanese': 'ja',
        'korean': 'ko',
        'russian': 'ru',
        'portuguese': 'pt',
        'italian': 'it',
        'dutch': 'nl',
        'polish': 'pl',
        'arabic': 'ar',
        'hindi': 'hi',
        'turkish': 'tr',
        'swedish': 'sv',
        'danish': 'da',
        'norwegian': 'no',
        'finnish': 'fi',
        'czech': 'cs',
        'hungarian': 'hu',
        'romanian': 'ro',
        'ukrainian': 'uk',
        'vietnamese': 'vi',
        'thai': 'th',
        'indonesian': 'id',
        'malay': 'ms',
    }
    
    if lang_lower in lang_name_map:
        code = lang_name_map[lang_lower]
        return LANGUAGE_SUFFIX_MAP.get(code, f"{code}")
    
    # Last resort: return as-is or default
    if len(lang_lower) <= 3:
        return lang_lower
    
    return LANGUAGE_SUFFIX_MAP['default']


def run_whisper_process(input_file, output_dir, original_filename, model_dir, tracker, 
                        task="transcribe", model_size="small"):
    """
    Run whisper-ctranslate2 with proper error handling.
    Returns (success: bool, actual_vtt_file: Path or None, json_data: tuple)
    
    Strategy: 
    1. Run whisper with JSON output to detect language
    2. Run whisper AGAIN with VTT-only output
    3. Clean up JSON file
    """
    
    # STEP 1: Run with JSON format to detect language
    cmd_json = [
        str(VENVPYTHON),
        str(WHISPER_EXE),
        str(input_file),
        '--model', model_size,
        '--model_directory', str(model_dir),
        '--compute_type', 'int8',
        '--output_dir', str(output_dir),
        '--output_format', 'json',   # Only JSON for detection
        '--task', task,
        '--vad_filter', 'True',
        '--vad_min_silence_duration_ms', '1000',
    ]
    
    task_display = "Translate to English" if task == "translate" else "Transcribe (Original Language)"
    
    print(f"Running Whisper...")
    print(f"   Input: {input_file.name}")
    print(f"   Mode:  {task_display}")
    print(f"   Model: {model_size.upper()} (from local directory)")
    print(f"   Output format: VTT only")
    print(f"   VAD Filter: ENABLED (skip silences >1s)")
    print()
    
    tracker.update(force=True)
    
    json_data = None
    
    try:
        # Step 1: Get JSON for language detection
        print("   [1/2] Detecting language...")
        result_json = subprocess.run(
            cmd_json,
            capture_output=True,
            text=True,
            timeout=None 
        )
        
        # Parse JSON for language detection
        json_files = list(output_dir.glob('*.json'))
        if json_files:
            latest_json = max(json_files, key=lambda p: p.stat().st_mtime)
            json_data = detect_language_from_json(latest_json)
            
            # Delete JSON file immediately after reading
            try:
                latest_json.unlink()
                print("   [1/2] Language detected, JSON cleaned up")
            except:
                pass
        
        # Step 2: Generate VTT only
        print("   [2/2] Generating VTT subtitle...")
        
        cmd_vtt = [
            str(VENVPYTHON),
            str(WHISPER_EXE),
            str(input_file),
            '--model', model_size,
            '--model_directory', str(model_dir),
            '--compute_type', 'int8',
            '--output_dir', str(output_dir),
            '--output_format', 'vtt',   # ONLY VTT output
            '--task', task,
            '--vad_filter', 'True',
            '--vad_min_silence_duration_ms', '1000',
        ]
        
        result_vtt = subprocess.run(
            cmd_vtt,
            capture_output=True,
            text=True,
            timeout=None 
        )
        
        if result_vtt.returncode != 0:
            print(f"\n[FAIL] Whisper failed with error code {result_vtt.returncode}!")
            if result_vtt.stderr:
                print(f"   Error Details:\n{result_vtt.stderr[:500]}")
            elif result_vtt.stdout:
                 print(f"   Output:\n{result_vtt.stdout[:500]}")
            return False, None, None
        
        # Find generated VTT file
        vtt_files = list(output_dir.glob('*.vtt'))
        
        if not vtt_files:
            print(f"\n[FAIL] Whisper finished, but NO .vtt file was created in {output_dir}")
            if result_vtt.stdout:
                print(f"   Process Output: {result_vtt.stdout[:200]}")
            return False, None, None
        
        latest_vtt = max(vtt_files, key=lambda p: p.stat().st_mtime)
        print(f"Created VTT: {latest_vtt.name}")
        
        return True, latest_vtt, json_data
        
    except subprocess.TimeoutExpired:
        print(f"\n[FAIL] Process timed out!")
        return False, None, None
    except Exception as e:
        print(f"\n[FAIL] EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        return False, None, None


def rename_with_language_suffix(original_filename, actual_vtt_path, output_dir, 
                                 json_data, task_mode, forced_suffix=None):
    """
    Rename VTT file to include language suffix.
    
    Args:
        forced_suffix: If provided, use this instead of auto-detection
                     (e.g., 'de' for forced German translation output)
    
    Returns final VTT path.
    """
    if not actual_vtt_path:
        return None
    
    # Determine language suffix
    if forced_suffix:
        # User explicitly requested this suffix
        lang_suffix = forced_suffix
        display_lang = f"{forced_suffix} (user-specified)"
    elif task_mode == "translate":
        # Translation defaults to English unless forced otherwise
        lang_suffix = "en"
        display_lang = "English (translated)"
    else:
        # Transcription uses detected language from JSON
        if json_data:
            lang_code, _ = json_data
            lang_suffix = get_language_suffix(lang_code)
            display_lang = f"{lang_code} ({lang_suffix})"
        else:
            # Fallback if no language detected
            lang_suffix = LANGUAGE_SUFFIX_MAP['default']
            display_lang = "Unknown (und)"
    
    # Construct new filename: original_name.lang_suffix.vtt
    new_vtt_name = f"{original_filename}.{lang_suffix}.vtt"
    final_vtt_path = output_dir / new_vtt_name
    
    print(f"\nRenaming with language suffix:")
    print(f"   Target: {display_lang}")
    print(f"   From: {actual_vtt_path.name}")
    print(f"   To:   {final_vtt_path.name}")
    
    try:
        # Remove existing file if it exists
        if final_vtt_path.exists():
            final_vtt_path.unlink()
        
        actual_vtt_path.rename(final_vtt_path)
        print(f"   ✓ Renamed successfully!")
        
        return final_vtt_path
        
    except Exception as e:
        print(f"   ✗ Rename failed: {e}")
        print(f"   Keeping original name: {actual_vtt_path.name}")
        return actual_vtt_path


def process_file_with_progress(file_index, total_files, file_path, model_dir, task_mode, 
                                model_size, forced_lang_suffix=None):
    """
    Process a single file with detailed progress tracking.
    
    Args:
        forced_lang_suffix: If provided, use this suffix instead of auto-detecting
                           (useful when user explicitly requests a translation language)
    """
    tracker = ProgressTracker(file_index, total_files, file_path)
    
    filename = file_path.stem
    ext = file_path.suffix.lower()
    
    tracker.start_processing()
    
    rel_path = file_path.relative_to(VIDEOS_DIR)
    
    out_dir = SUBTITLES_DIR / rel_path.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    
    temp_audio = None
    
    try:
        if ext == '.mp3':
            whisper_input = file_path
            print(f"Processing MP3 directly...")
        else:
            print(f"Step 1/2: Extracting audio track...")
            tracker.update(force=True)
            
            temp_audio = SCRIPT_DIR / f"temp_audio_{os.getpid()}.m4a"
            
            ffmpeg_cmd = [
                'ffmpeg', '-y',
                '-i', str(file_path),
                '-vn', '-acodec', 'copy',
                str(temp_audio)
            ]
            
            print(f"   Running: ffmpeg -i \"{file_path.name}\" -vn -acodec copy temp_audio.m4a")
            
            ffmpeg_result = subprocess.run(
                ffmpeg_cmd,
                capture_output=True,
                text=True
            )
            
            if not temp_audio.exists():
                print(f"[FAIL] Failed to extract audio from {file_path.name}")
                if ffmpeg_result.stderr:
                    print(f"   FFmpeg error: {ffmpeg_result.stderr[:500]}")
                tracker.complete(False)
                return False
            
            print(f"Audio extracted: {temp_audio.name}")
            print()
            
            whisper_input = temp_audio
            
            print(f"Step 2/2: Running Whisper on extracted audio...")
        
        success, actual_vtt, json_data = run_whisper_process(
            whisper_input, 
            out_dir, 
            filename, 
            model_dir, 
            tracker,
            task=task_mode,
            model_size=model_size
        )
        
        if temp_audio and temp_audio.exists():
            try:
                temp_audio.unlink()
                print(f"Cleaned up temp file: {temp_audio.name}")
            except:
                pass
        
        if not success:
            tracker.complete(False)
            return False
        
        # Use forced suffix if provided, otherwise auto-detect
        final_output = rename_with_language_suffix(
            filename, 
            actual_vtt, 
            out_dir, 
            json_data,
            task_mode,
            forced_suffix=forced_lang_suffix  # NEW PARAMETER
        )
        
        tracker.complete(True, final_output)
        return True
        
    except Exception as e:
        print(f"\n[FAIL] UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        
        if temp_audio and temp_audio.exists():
            try:
                temp_audio.unlink()
            except:
                pass
        
        tracker.complete(False)
        return False


def print_final_summary(stats, start_time):
    """Print final processing summary"""
    total_time = time.time() - start_time
    
    print("\n" + "=" * 70)
    print("BATCH PROCESS COMPLETE - SUMMARY")
    print("=" * 70)
    print()
    print(f"Total Files Processed: {stats['total']}")
    if stats['total'] > 0:
        print(f"Successful:             {stats['success']} ({stats['success']/stats['total']*100:.1f}%)")
    print(f"Failed:                  {stats['failed']}")
    print()
    print(f"Total Runtime:           {format_duration(total_time)}")
    
    if stats['total'] > 0 and total_time > 0:
        avg_time = total_time / stats['total']
        print(f"Average Time per File:   {format_duration(avg_time)}")
    
    print()
    print("Output files use language suffixes:")
    print("  • English:      filename.en-US.vtt")
    print("  • German:       filename.de.vtt")  
    print("  • French:       filename.fr.vtt")
    print("  • Chinese:      filename.zh-CN.vtt")
    print("  • Japanese:     filename.ja.vtt")
    print("  • (Translated): filename.en.vtt")
    print()
    
    if stats['failed'] > 0:
        print("Some files failed to process. Check error messages above.")
    
    print("=" * 70)


def main():
    """Main entry point"""
    overall_start = time.time()
    
    print_header()
    check_venv()
    
    print(f"Root Directory:       {ROOT_DIR}")
    print(f"Videos Directory:     {VIDEOS_DIR}")
    print(f"Subtitles Directory:  {SUBTITLES_DIR}")
    print(f"Models Directory:     {LOCAL_MODEL_BASE_DIR}")
    
    # Get choices first so we can verify model existence
    choice = get_user_choice()
    task_mode = get_task_choice()
    model_size = get_model_choice()
    
    # NEW: Always ask for target language suffix (both modes!)
    target_lang_suffix = get_target_language_suffix(task_mode)
    
    # Verify model exists based on selection
    model_dir = find_model_directory(model_size)
    if model_dir:
        print(f"Model Found ({model_size.upper()}): {model_dir}")
    else:
        print(f"FATAL ERROR: Model '{model_size}' NOT FOUND at {LOCAL_MODEL_BASE_DIR / model_name.capitalize()}")
        print("Please ensure the folder exists and contains model.bin.")
        input("\nPress Enter to exit...")
        sys.exit(1)
    
    print()
    
    if choice == 'A':
        target_dir = VIDEOS_DIR
        print(f"\nScanning ALL channels...")
    else:
        channels = list_channels()
        
        if not channels:
            print("ERROR: No channels found!")
            input("\nPress Enter to exit...")
            sys.exit(1)
        
        channel_name, target_dir = get_channel_name(channels)
        print(f"\nSelected channel: {channel_name}")
    
    # Pass target_lang_suffix to the scanner
    files_to_process = find_videos_needing_subtitles(target_dir, target_lang_suffix)
    
    if not files_to_process:
        print("\n" + "=" * 50)
        if target_lang_suffix:
            print(f"No missing [{target_lang_suffix}] subtitles found!")
            print("All videos already have this language variant.")
        else:
            print("No missing subtitles found. Everything is up to date!")
        print("=" * 50)
        input("\nPress Enter to exit...")
        return
    
    print("\n" + "=" * 70)
    print(f"Found {len(files_to_process)} files needing subtitle generation")
    if target_lang_suffix:
        print(f"Target Language Suffix: .{target_lang_suffix}.vtt")
    else:
        print("(Auto-detecting language per file)")
    print("=" * 70)
    
    total_size = sum(f.stat().st_size for f in files_to_process)
    print(f"Total size to process: {format_file_size(total_size)}")
    print()
    
    confirm = input(f"Process {len(files_to_process)} files? (y/n): ").strip().lower()
    if confirm != 'y':
        print("Cancelled.")
        input("\nPress Enter to exit...")
        return
    
    print()
    print("Starting processing...")
    if target_lang_suffix:
        print(f"(Generating: filename.{target_lang_suffix}.vtt)")
    else:
        print("(Auto-detecting language and generating appropriate suffix)")
    print("=" * 70)
    print()
    
    stats = {
        'total': len(files_to_process),
        'success': 0,
        'failed': 0
    }
    
    for i, file_path in enumerate(files_to_process, 1):
        # Pass forced_lang_suffix when user specified one
        if process_file_with_progress(
            i, 
            len(files_to_process), 
            file_path, 
            model_dir, 
            task_mode, 
            model_size,
            forced_lang_suffix=target_lang_suffix  # Pass user's choice
        ):
            stats['success'] += 1
        else:
            stats['failed'] += 1
        
        print() 
    
    print_final_summary(stats, overall_start)
    
    input("\nPress Enter to exit...")


if __name__ == "__main__":
    main()