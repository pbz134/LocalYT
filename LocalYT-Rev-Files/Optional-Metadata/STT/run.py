#!/usr/bin/env python3
import os
import sys
import subprocess
import time
import json
import re
import argparse
from pathlib import Path

# ==========================================
# CONFIGURATION
# ==========================================

SCRIPT_DIR = Path(__file__).parent.resolve()
ROOT_DIR = SCRIPT_DIR.parent.parent.parent

VENVPYTHON = ROOT_DIR / "venv" / "python.exe"
WHISPER_EXE = ROOT_DIR / "venv" / "Scripts" / "whisper-ctranslate2.exe"
VIDEOS_DIR = ROOT_DIR / "videos"
SUBTITLES_DIR = ROOT_DIR / "subtitles"

# ==========================================
# LOCAL MODEL CONFIGURATION
# ==========================================

LOCAL_MODEL_BASE_DIR = SCRIPT_DIR / "Whisper"

AVAILABLE_MODELS = {
    'tiny.en': {
        'speed': '10x', 
        'vram': '0.5GB', 
        'desc': 'Fastest, English only', 
        'folder': 'Tiny'
    },
    'base.en': {
        'speed': '7x', 
        'vram': '0.7GB', 
        'desc': 'Fast, English only', 
        'folder': 'Base'
    },
    'small.en': { 
        'speed': '5x', 
        'vram': '1GB', 
        'desc': 'Balanced, English only', 
        'folder': 'Small'
    },
    'medium': {
        'speed': '2x', 
        'vram': '2.5GB', 
        'desc': 'Slower, Multilingual (High Acc)', 
        'folder': 'Medium'
    },
    'large-v3': {
        'speed': '1x', 
        'vram': '5GB', 
        'desc': 'Slowest, Highest accuracy (Multi)', 
        'folder': 'Large'
    },
}

LANGUAGE_SUFFIX_MAP = {
    'en': 'en', 'de': 'de', 'fr': 'fr', 'es': 'es',
    'it': 'it', 'pt': 'pt', 'nl': 'nl', 'pl': 'pl',
    'ru': 'ru', 'ja': 'ja', 'ko': 'ko', 'zh': 'zh-CN',
    'yue': 'zh-HK', 'ar': 'ar', 'hi': 'hi', 'tr': 'tr',
    'sv': 'sv', 'da': 'da', 'no': 'no', 'fi': 'fi',
    'cs': 'cs', 'hu': 'hu', 'ro': 'ro', 'uk': 'uk',
    'vi': 'vi', 'th': 'th', 'id': 'id', 'ms': 'ms',
    'default': 'und',
}

PROGRESS_UPDATE_INTERVAL = 0.5

# ----------------------------------------------------------------------
# Helper functions (unchanged)
# ----------------------------------------------------------------------

def find_model_directory(model_id='small.en'):
    if model_id not in AVAILABLE_MODELS:
        return None
    folder_name = AVAILABLE_MODELS[model_id]['folder']
    target_dir = LOCAL_MODEL_BASE_DIR / folder_name
    if target_dir.exists() and target_dir.is_dir():
        if (target_dir / "model.bin").exists() or (target_dir / "config.json").exists():
            return target_dir
    return None

def format_duration(seconds):
    if seconds < 60:
        return f"{seconds:.1f}s"
    elif seconds < 3600:
        return f"{int(seconds // 60)}m {int(seconds % 60):02d}s"
    else:
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        return f"{hours}h {minutes:02d}m"

def format_file_size(bytes_size):
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_size < 1024.0:
            return f"{bytes_size:.1f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.1f} TB"

def print_progress_bar(current, total, prefix='', suffix='', length=40):
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
    print("=" * 60)
    print("      LOCALYT SUBTITLE PROCESSOR")
    print("=" * 60)
    print()

def check_venv():
    if not VENVPYTHON.exists():
        print(f"ERROR: Python venv not found at {VENVPYTHON}")
        sys.exit(1)

def get_user_choice():
    print("[A] Process ALL channels")
    print("[S] Process Specific Channel")
    print()
    while True:
        choice = input("Please select an option (A/S): ").strip().upper()
        if choice in ['A', 'S']:
            return choice
        print("Invalid choice. Please enter A or S.")

def get_task_choice():
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
    print()
    print("=" * 60)
    print("LANGUAGE DETECTION MODE")
    print("=" * 60)
    print()
    print("The system is configured to ALWAYS detect language automatically.")
    print("This ensures accurate language tagging but requires 2 processing passes.")
    print()
    input("Press Enter to continue with Auto-Detection...")
    return None

def get_model_choice():
    print()
    print("Select AI Model:")
    print("-" * 60)
    keys = ['tiny.en', 'base.en', 'small.en', 'medium', 'large-v3']
    valid_keys = {}
    idx = 1
    for key in keys:
        info = AVAILABLE_MODELS[key]
        is_en_only = key.endswith('.en')
        lang_tag = "(English Only)" if is_en_only else "(Multilingual)"
        display_name = key.replace('.', ' ').title() 
        print(f"[{idx}] {display_name:20} | {info['desc']}")
        print(f"    Speed: ~{info['speed']} real-time | VRAM: {info['vram']} | {lang_tag}")
        valid_keys[str(idx)] = key
        idx += 1
    print("-" * 60)
    while True:
        choice = input(f"Please select a model (1-{len(keys)}): ").strip()
        if choice in valid_keys:
            return valid_keys[choice]
        print(f"Invalid choice. Please enter a number between 1 and {len(keys)}.")

def list_channels():
    if not VIDEOS_DIR.exists():
        print(f"ERROR: Videos directory not found: {VIDEOS_DIR}")
        return []
    channels = sorted([d.name for d in VIDEOS_DIR.iterdir() if d.is_dir()])
    return channels

def get_channel_name(channels):
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

def resolve_channel_name(channel_name):
    target_dir = VIDEOS_DIR / channel_name
    if target_dir.exists():
        return channel_name, target_dir
    channels = list_channels()
    matches = [c for c in channels if c.lower() == channel_name.lower()]
    if matches:
        resolved = matches[0]
        print(f"Matched channel: '{resolved}' (case-insensitive)")
        return resolved, VIDEOS_DIR / resolved
    return None, None

def should_skip_file(filename, ext):
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
    files_to_process = []
    video_extensions = {'.mp4', '.mkv'}
    audio_extensions = {'.mp3'}
    all_extensions = video_extensions | audio_extensions
    print(f"\nScanning: {target_dir}")
    print("Checking for existing subtitles... (Auto-Detect Mode)")
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
        needs_processing = False
        if sub_parent.exists():
            pattern = f"{filename}*.vtt"
            existing_subs = list(sub_parent.glob(pattern))
            if not existing_subs:
                needs_processing = True
            else:
                langs_str = ", ".join([s.stem.split('.')[-1] if '.' in s.stem else 'und' for s in existing_subs])
                print(f"  [OK]   {file_path.name} (has [{langs_str}] subtitle)")
        else:
            needs_processing = True
        if needs_processing:
            files_to_process.append(file_path)
            file_size = file_path.stat().st_size
            duration = get_video_duration(file_path)
            print(f"  [QUEUE] {file_path.name}")
            print(f"          Size: {format_file_size(file_size)} | Duration: ~{format_duration(duration)}")
    return files_to_process

class ProgressTracker:
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
        self.process_start = time.time()
        print(f"\n{'='*70}")
        print(f"FILE [{self.file_index}/{self.total_files}]: {self.file_name}")
        print(f"   Size: {format_file_size(self.file_size)} | Duration: ~{format_duration(self.duration)}")
        print(f"{'='*70}")
        print()
    def update(self, force=False):
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
        elapsed = time.time() - self.process_start
        print() 
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
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if 'language' in data:
            lang = data['language'].lower()
            return lang, 1.0
        if 'segments' in data and len(data['segments']) > 0:
            first_seg = data['segments'][0]
            if 'language' in first_seg:
                lang = first_seg['language'].lower()
                return lang, 1.0
        return None, 0.0
    except Exception as e:
        print(f"   Warning: Could not parse JSON for language detection: {e}")
        return None, 0.0

def get_language_suffix(language_code):
    if not language_code:
        return LANGUAGE_SUFFIX_MAP['default']
    lang_lower = language_code.lower().strip()
    if lang_lower in LANGUAGE_SUFFIX_MAP:
        return LANGUAGE_SUFFIX_MAP[lang_lower]
    lang_name_map = {
        'english': 'en', 'german': 'de', 'french': 'fr', 'spanish': 'es',
        'chinese': 'zh', 'japanese': 'ja', 'korean': 'ko', 'russian': 'ru',
        'portuguese': 'pt', 'italian': 'it', 'dutch': 'nl', 'polish': 'pl',
        'arabic': 'ar', 'hindi': 'hi', 'turkish': 'tr', 'swedish': 'sv',
        'danish': 'da', 'norwegian': 'no', 'finnish': 'fi', 'czech': 'cs',
        'hungarian': 'hu', 'romanian': 'ro', 'ukrainian': 'uk', 'vietnamese': 'vi',
        'thai': 'th', 'indonesian': 'id', 'malay': 'ms',
    }
    if lang_lower in lang_name_map:
        code = lang_name_map[lang_lower]
        return LANGUAGE_SUFFIX_MAP.get(code, code)
    if len(lang_lower) <= 3:
        return lang_lower
    return LANGUAGE_SUFFIX_MAP['default']

# ----------------------------------------------------------------------
# NEW: Safe marker addition at the END of the VTT file
# ----------------------------------------------------------------------
def add_ai_generated_comment(vtt_path, model_id, task_mode):
    """
    Append a comment block at the end of the VTT file.
    This is safe and does not interfere with the browser's TextTrack parser.
    """
    try:
        with open(vtt_path, 'r', encoding='utf-8') as f:
            content = f.read()
        if 'NOTE Generated by LocalYT-AI' in content:
            return
        timestamp = time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())
        note = f"""
NOTE Generated by LocalYT-AI on {timestamp}
NOTE Model: {model_id} | Task: {task_mode}
NOTE This is an AI-generated subtitle, not official YouTube content.
"""
        # Append to the file
        with open(vtt_path, 'a', encoding='utf-8') as f:
            f.write(note)
        print(f"   ✓ Added AI-generated marker at end of file")
    except Exception as e:
        print(f"   Warning: Could not add AI-generated marker: {e}")

# ----------------------------------------------------------------------
# Whisper processing (unchanged, but we now call the new marker)
# ----------------------------------------------------------------------

def run_whisper_process(input_file, output_dir, original_filename, model_dir, tracker, 
                        task="transcribe", model_id="small"):
    base_args = [
        str(VENVPYTHON),
        str(WHISPER_EXE),
        str(input_file),
        '--model', model_id,
        '--model_directory', str(model_dir),
        '--compute_type', 'int8',
        '--output_dir', str(output_dir),
        '--task', task,
        '--vad_filter', 'True',
        '--vad_min_silence_duration_ms', '1000',
    ]
    task_display = "Translate to English" if task == "translate" else "Transcribe"
    print(f"Running Whisper...")
    print(f"   Input: {input_file.name}")
    print(f"   Mode:  {task_display}")
    print(f"   Model: {model_id.upper()} (local)")
    print(f"   Lang:  AUTO-DETECTING (Forced)")
    print(f"   Plan:  Dual Pass (JSON Detection -> VTT Generation)")
    print()
    detected_data = None
    tracker.update(force=True)
    # Clear any existing output files
    for old_file in output_dir.glob(f"{original_filename}*"):
        try:
            old_file.unlink()
        except:
            pass
    # Pass 1: JSON
    print("   [1/2] Running language detection (JSON)...")
    cmd_json = base_args + ['--output_format', 'json']
    result_json = subprocess.run(cmd_json, capture_output=True, text=True, timeout=None)
    json_files = list(output_dir.glob(f"{original_filename}*.json"))
    if not json_files:
        json_files = list(output_dir.glob('*.json'))
    if json_files:
        latest_json = max(json_files, key=lambda p: p.stat().st_mtime)
        detected_data = detect_language_from_json(latest_json)
        if detected_data and detected_data[0]:
            print(f"   [1/2] Detected Language: {detected_data[0]}")
        else:
            print(f"   [1/2] Could not detect language from JSON, will use default")
    else:
        print(f"   [1/2] Warning: No JSON file created")
        if result_json.stderr:
            print(f"   Error: {result_json.stderr[:500]}")
    # Pass 2: VTT
    print("   [2/2] Generating subtitle (VTT)...")
    cmd_vtt = base_args + ['--output_format', 'vtt']
    result_vtt = subprocess.run(cmd_vtt, capture_output=True, text=True, timeout=None)
    if result_vtt.returncode != 0:
        print(f"\n[FAIL] Whisper failed with error code {result_vtt.returncode}!")
        if result_vtt.stderr:
            print(f"   Error Details:\n{result_vtt.stderr[:1000]}")
        return False, None, None
    vtt_files = list(output_dir.glob(f"{original_filename}*.vtt"))
    if not vtt_files:
        vtt_files = list(output_dir.glob('*.vtt'))
    if not vtt_files:
        print(f"\n[FAIL] No VTT file created.")
        if result_vtt.stderr:
            print(f"   Error Details:\n{result_vtt.stderr[:500]}")
        return False, None, None
    latest_vtt = max(vtt_files, key=lambda p: p.stat().st_mtime)
    print(f"   Created VTT: {latest_vtt.name}")
    # Clean up JSON
    if json_files:
        for json_file in json_files:
            try:
                json_file.unlink()
            except:
                pass
    return True, latest_vtt, detected_data

def rename_with_language_suffix(original_filename, actual_vtt_path, output_dir, 
                                 json_data, task_mode):
    if not actual_vtt_path:
        return None
    if task_mode == "translate":
        lang_suffix = "en"
        display_lang = "English (translated)"
    else:
        if json_data and json_data[0]:
            lang_code, _ = json_data
            lang_suffix = get_language_suffix(lang_code)
            display_lang = f"{lang_code} ({lang_suffix})"
        else:
            lang_suffix = LANGUAGE_SUFFIX_MAP['default']
            display_lang = f"Unknown ({lang_suffix})"
    new_vtt_name = f"{original_filename}.{lang_suffix}.vtt"
    final_vtt_path = output_dir / new_vtt_name
    print(f"\nRenaming with language suffix:")
    print(f"   Target: {display_lang}")
    print(f"   From: {actual_vtt_path.name}")
    print(f"   To:   {final_vtt_path.name}")
    try:
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
                                model_id):
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
            print(f"   Running: ffmpeg -i \"{file_path.name}\" -vn -acodec copy ...")
            ffmpeg_result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
            if not temp_audio.exists():
                print(f"[FAIL] Failed to extract audio from {file_path.name}")
                if ffmpeg_result.stderr:
                    print(f"   FFmpeg error: {ffmpeg_result.stderr[:500]}")
                tracker.complete(False)
                return False
            print(f"   Audio extracted successfully ({format_file_size(temp_audio.stat().st_size)})")
            print()
            whisper_input = temp_audio
            print(f"Step 2/2: Running Whisper...")
        success, actual_vtt, json_data = run_whisper_process(
            whisper_input, 
            out_dir, 
            filename, 
            model_dir, 
            tracker,
            task=task_mode,
            model_id=model_id
        )
        if temp_audio and temp_audio.exists():
            try:
                temp_audio.unlink()
                print(f"   Cleaned up temp file: {temp_audio.name}")
            except:
                pass
        if not success:
            tracker.complete(False)
            return False
        final_output = rename_with_language_suffix(
            filename, 
            actual_vtt, 
            out_dir, 
            json_data,
            task_mode
        )
        # --- ADD THE AI-GENERATED MARKER AT THE END ---
        if final_output:
            add_ai_generated_comment(final_output, model_id, task_mode)
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
    print("Output files use language suffixes based on detection:")
    print("  • English:      filename.en.vtt")
    print("  • German:       filename.de.vtt")  
    print("  • French:       filename.fr.vtt")
    print("  • Chinese:      filename.zh-CN.vtt")
    print("  • Japanese:     filename.ja.vtt")
    print("  • (Translated): filename.en.vtt")
    print()
    print("All generated subtitles include an AI-generated marker comment at the end:")
    print("  NOTE Generated by LocalYT-AI on [timestamp]")
    print("  NOTE Model: [model] | Task: [task]")
    print("  NOTE This is an AI-generated subtitle, not official YouTube content.")
    print()
    if stats['failed'] > 0:
        print("Some files failed to process. Check error messages above.")
    print("=" * 70)

# ----------------------------------------------------------------------
# CLI parsing and main (unchanged)
# ----------------------------------------------------------------------

def build_parser():
    model_choices = list(AVAILABLE_MODELS.keys())
    parser = argparse.ArgumentParser(
        description='LocalYT Subtitle Processor — generate subtitles for video/audio files using Whisper.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""\
examples:
  # Interactive mode (no args) — prompts for everything:
  python run.py

  # Process all channels, non-interactive:
  python run.py --all --model small.en --task transcribe -y

  # Process a specific channel, translate to English:
  python run.py --channel "MrBeast" --model medium --task translate -y

  # Mix CLI and interactive: provide some args, get prompted for the rest:
  python run.py --model large-v3 --task transcribe
"""
    )
    channel_group = parser.add_mutually_exclusive_group()
    channel_group.add_argument('--channel', '-c', type=str, metavar='NAME', help='Process a specific channel by name')
    channel_group.add_argument('--all', '-a', action='store_true', help='Process all channels')
    parser.add_argument('--model', '-m', type=str, choices=model_choices, metavar='MODEL', help=f'AI model to use (choices: {", ".join(model_choices)})')
    parser.add_argument('--task', '-t', type=str, choices=['transcribe', 'translate'], metavar='MODE', help='Processing mode: "transcribe" (keep original language) or "translate" (to English)')
    parser.add_argument('-y', '--yes', action='store_true', help='Non-interactive mode: skip all confirmation prompts and "press enter" waits. When set, --channel/--all, --model, and --task become required.')
    parser.add_argument('--list-channels', action='store_true', help='List all available channel names and exit')
    parser.add_argument('--list-models', action='store_true', help='List all available models and exit')
    return parser

def list_channels_cli():
    channels = list_channels()
    if not channels:
        print("No channels found.")
    else:
        print("Available channels:")
        for ch in channels:
            print(f"  {ch}")

def list_models_cli():
    print("Available models:")
    print("-" * 60)
    keys = ['tiny.en', 'base.en', 'small.en', 'medium', 'large-v3']
    for key in keys:
        info = AVAILABLE_MODELS[key]
        is_en_only = key.endswith('.en')
        lang_tag = "(English Only)" if is_en_only else "(Multilingual)"
        display_name = key.replace('.', ' ').title()
        print(f"  {display_name:20} | {info['desc']}")
        print(f"  {'':20} | Speed: ~{info['speed']} | VRAM: {info['vram']} | {lang_tag}")
    print("-" * 60)

def main():
    parser = build_parser()
    args = parser.parse_args()
    if args.list_channels:
        list_channels_cli()
        return
    if args.list_models:
        list_models_cli()
        return
    if args.yes:
        if not args.all and not args.channel:
            parser.error("In non-interactive mode (-y), --channel or --all is required")
        if not args.model:
            parser.error("In non-interactive mode (-y), --model is required")
        if not args.task:
            parser.error("In non-interactive mode (-y), --task is required")
    overall_start = time.time()
    print_header()
    check_venv()
    print(f"Root Directory:       {ROOT_DIR}")
    print(f"Videos Directory:     {VIDEOS_DIR}")
    print(f"Subtitles Directory:  {SUBTITLES_DIR}")
    print(f"Models Directory:     {LOCAL_MODEL_BASE_DIR}")
    if args.all:
        choice = 'A'
    elif args.channel:
        choice = 'S'
    else:
        choice = get_user_choice()
    if args.task:
        task_mode = args.task
    else:
        task_mode = get_task_choice()
    if args.model:
        model_id = args.model
    else:
        model_id = get_model_choice()
    if args.yes:
        target_lang_suffix = None
    else:
        target_lang_suffix = get_target_language_suffix(task_mode)
    model_dir = find_model_directory(model_id)
    if model_dir:
        print(f"\nModel Found ({model_id.upper()}): {model_dir}")
    else:
        print(f"\nFATAL ERROR: Model '{model_id}' NOT FOUND.")
        print("Please ensure you ran the downloader script first.")
        if not args.yes:
            input("\nPress Enter to exit...")
        sys.exit(1)
    print()
    if choice == 'A':
        target_dir = VIDEOS_DIR
        print(f"Scanning ALL channels...")
    else:
        if args.channel:
            channel_name, target_dir = resolve_channel_name(args.channel)
            if channel_name is None:
                print(f"ERROR: Channel folder not found: {args.channel}")
                if not args.yes:
                    input("\nPress Enter to exit...")
                sys.exit(1)
            print(f"Selected channel: {channel_name}")
        else:
            channels = list_channels()
            if not channels:
                print("ERROR: No channels found!")
                if not args.yes:
                    input("\nPress Enter to exit...")
                sys.exit(1)
            channel_name, target_dir = get_channel_name(channels)
            print(f"Selected channel: {channel_name}")
    files_to_process = find_videos_needing_subtitles(target_dir, target_lang_suffix)
    if not files_to_process:
        print("\n" + "=" * 50)
        print("No missing subtitles found! Everything is up to date.")
        print("=" * 50)
        if not args.yes:
            input("\nPress Enter to exit...")
        return
    print("\n" + "=" * 70)
    print(f"Found {len(files_to_process)} files needing subtitle generation")
    print("(Auto-detecting language per file)")
    print("=" * 70)
    total_size = sum(f.stat().st_size for f in files_to_process)
    print(f"Total size to process: {format_file_size(total_size)}")
    print()
    if args.yes:
        confirm = 'y'
    else:
        confirm = input(f"Process {len(files_to_process)} files? (y/n): ").strip().lower()
    if confirm != 'y':
        print("Cancelled.")
        if not args.yes:
            input("\nPress Enter to exit...")
        return
    print()
    print("Starting processing...")
    print("(Auto-detecting language)")
    print("=" * 70)
    print()
    stats = {
        'total': len(files_to_process),
        'success': 0,
        'failed': 0
    }
    for i, file_path in enumerate(files_to_process, 1):
        if process_file_with_progress(
            i, 
            len(files_to_process), 
            file_path, 
            model_dir, 
            task_mode, 
            model_id
        ):
            stats['success'] += 1
        else:
            stats['failed'] += 1
        print() 
    print_final_summary(stats, overall_start)
    if not args.yes:
        input("\nPress Enter to exit...")

if __name__ == "__main__":
    main()