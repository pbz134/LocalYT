#!/usr/bin/env python3
import os
import sys
import subprocess
import time
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

# FIXED: Point to the 'Whisper' subfolder where your models actually are.
# This resolves: E:\LocalYT\subtitles\#STT\Whisper
LOCAL_MODEL_BASE_DIR = SCRIPT_DIR / "Whisper"

AVAILABLE_MODELS = {
    'tiny':   {'speed': '10x', 'vram': '0.5GB', 'desc': 'Fastest, medium accuracy'},
    'base':   {'speed': '7x', 'vram': '0.7GB', 'desc': 'Fast, good accuracy'},
    'small':  {'speed': '4x',  'vram': '1GB',   'desc': 'Best speed/accuracy balance'},
    'medium': {'speed': '2x',  'vram': '2.5GB', 'desc': 'Slower, suitable for non-English'},
    'large':  {'speed': '1x',  'vram': '5GB',   'desc': 'Slowest, highest accuracy'},
}

PROGRESS_UPDATE_INTERVAL = 0.5

def find_model_directory(model_name='small'):
    """
    Find the Whisper model directory for a specific model size.
    Looks for folders named exactly like the model (Case-Insensitive) in LOCAL_MODEL_BASE_DIR.
    
    Expected Structure:
    LOCAL_MODEL_BASE_DIR (Whisper)/
    ├── Tiny/
    ├── Base/
    ├── Small/
    ├── Medium/
    └── Large/
    """
    # Construct the expected path: e.g., E:\...\Whisper\Medium
    target_dir = LOCAL_MODEL_BASE_DIR / model_name.capitalize()
    
    if target_dir.exists() and target_dir.is_dir():
        # Verify it looks like a model dir (has config.json or model.bin)
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

def find_videos_needing_subtitles(target_dir):
    """Scan for files needing subtitle generation"""
    files_to_process = []
    
    video_extensions = {'.mp4', '.mkv'}
    audio_extensions = {'.mp3'}
    all_extensions = video_extensions | audio_extensions
    
    print(f"\nScanning: {target_dir}")
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
        sub_rel_path = rel_path.with_suffix('.vtt')
        expected_sub = SUBTITLES_DIR / sub_rel_path
        
        if not expected_sub.exists():
            files_to_process.append(file_path)
            
            file_size = file_path.stat().st_size
            duration = get_video_duration(file_path)
            
            print(f"  [QUEUE] {file_path.name}")
            print(f"          Size: {format_file_size(file_size)} | Duration: ~{format_duration(duration)}")
        else:
            print(f"  [OK]   {file_path.name} (subtitle exists)")
    
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

def run_whisper_process(input_file, output_dir, original_filename, model_dir, tracker, task="transcribe", model_size="small"):
    """
    Run whisper-ctranslate2 with proper error handling.
    Returns (success: bool, actual_output_file: Path or None)
    """
    cmd = [
        str(VENVPYTHON),
        str(WHISPER_EXE),
        str(input_file),                    # Input file (video or audio)
        '--model', model_size,              # Model size (tiny, base, small, medium, large)
        '--model_directory', str(model_dir), # Local model path
        '--compute_type', 'int8',           # Quantization
        '--output_dir', str(output_dir),    # Where to save output
        '--output_format', 'vtt',           # Output format
        '--task', task,                     # Task: transcribe or translate
        # NEW: VAD filter settings to skip silent/non-speech sections for faster processing
        '--vad_filter', 'True',             # Enable Voice Activity Detection to skip silence
        '--vad_min_silence_duration_ms', '1000',  # Only remove silences longer than 1 second
    ]
    
    task_display = "Translate to English" if task == "translate" else "Transcribe (Original Language)"
    
    print(f"Running Whisper...")
    print(f"   Input: {input_file.name}")
    print(f"   Mode:  {task_display}")
    print(f"   Model: {model_size.upper()} (from local directory)")
    print(f"   Output format: VTT")
    print(f"   VAD Filter: ENABLED (skip silences >1s)")  # Updated status line
    print()
    
    tracker.update(force=True)
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=None 
        )
        
        # FIX: Stricter error checking
        if result.returncode != 0:
            print(f"\n[FAIL] Whisper failed with error code {result.returncode}!")
            if result.stderr:
                print(f"   Error Details:\n{result.stderr[:500]}")
            elif result.stdout:
                 print(f"   Output:\n{result.stdout[:500]}")
            return False, None
        
        # Check if output actually exists immediately after run
        vtt_files = list(output_dir.glob('*.vtt'))
        
        if not vtt_files:
            # If no files found, check if whisper reported success but wrote nothing (weird edge case)
            # or if it failed silently.
            print(f"\n[FAIL] Whisper finished, but NO .vtt file was created in {output_dir}")
            if result.stdout:
                print(f"   Process Output: {result.stdout[:200]}")
            return False, None
        
        latest_vtt = max(vtt_files, key=lambda p: p.stat().st_mtime)
        print(f"Created file: {latest_vtt.name}")
        
        return True, latest_vtt
        
    except subprocess.TimeoutExpired:
        print(f"\n[FAIL] Process timed out!")
        return False, None
    except Exception as e:
        print(f"\n[FAIL] EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        return False, None

def rename_output_if_needed(actual_output, expected_output, original_filename):
    """
    Rename the output file to match the original video filename.
    Returns the final output Path.
    """
    if actual_output is None:
        return expected_output 
    
    if actual_output.name == f"{original_filename}.vtt":
        return actual_output
    
    final_output = expected_output 
    
    print(f"Renaming output:")
    print(f"   From: {actual_output.name}")
    print(f"   To:   {final_output.name}")
    
    try:
        if final_output.exists():
            final_output.unlink()
        
        actual_output.rename(final_output)
        print(f"   Renamed successfully!")
        return final_output
        
    except Exception as e:
        print(f"   Rename failed: {e}")
        print(f"   Keeping original name: {actual_output.name}")
        return actual_output

def process_file_with_progress(file_index, total_files, file_path, model_dir, task_mode, model_size):
    """
    Process a single file with detailed progress tracking.
    """
    tracker = ProgressTracker(file_index, total_files, file_path)
    
    filename = file_path.stem
    ext = file_path.suffix.lower()
    
    tracker.start_processing()
    
    rel_path = file_path.relative_to(VIDEOS_DIR)
    expected_output = SUBTITLES_DIR / rel_path.with_suffix('.vtt')
    
    out_dir = expected_output.parent
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
        
        success, actual_output = run_whisper_process(
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
        
        final_output = rename_output_if_needed(actual_output, expected_output, filename)
        
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
    
    # Verify model exists based on selection
    model_dir = find_model_directory(model_size)
    if model_dir:
        print(f"Model Found ({model_size.upper()}): {model_dir}")
    else:
        print(f"FATAL ERROR: Model '{model_size}' NOT FOUND at {LOCAL_MODEL_BASE_DIR / model_size.capitalize()}")
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
    
    files_to_process = find_videos_needing_subtitles(target_dir)
    
    if not files_to_process:
        print("\n" + "=" * 50)
        print("No missing subtitles found. Everything is up to date!")
        print("=" * 50)
        input("\nPress Enter to exit...")
        return
    
    print("\n" + "=" * 70)
    print(f"Found {len(files_to_process)} files needing subtitle generation")
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
    print("=" * 70)
    print()
    
    stats = {
        'total': len(files_to_process),
        'success': 0,
        'failed': 0
    }
    
    for i, file_path in enumerate(files_to_process, 1):
        if process_file_with_progress(i, len(files_to_process), file_path, model_dir, task_mode, model_size):
            stats['success'] += 1
        else:
            stats['failed'] += 1
        
        print() 
    
    print_final_summary(stats, overall_start)
    
    input("\nPress Enter to exit...")

if __name__ == "__main__":
    main()