#!/usr/bin/env python3
"""
LocalYT Subtitle Processor - FIXED VERSION
Processes video files through Whisper with correct output naming
"""

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

MODEL_DIRS = [
    SCRIPT_DIR / "hub" / "models--Systran--faster-whisper-small" / "snapshots",
    ROOT_DIR / "hub" / "models--Systran--faster-whisper-small" / "snapshots",
]

PROGRESS_UPDATE_INTERVAL = 0.5

def find_model_directory():
    """Find the Whisper model directory"""
    for model_dir in MODEL_DIRS:
        if model_dir.exists():
            snapshots = list(model_dir.iterdir())
            if snapshots:
                return snapshots[0]
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
        print(f"📁 FILE [{self.file_index}/{self.total_files}]: {self.file_name}")
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
                prefix=f'⏱️  Elapsed: {elapsed_str}',
                suffix=f'| ETA: {eta_str}',
                length=30
            )
        else:
            sys.stdout.write(f'\r⏱️  Elapsed: {elapsed_str} | Processing...     ')
            sys.stdout.flush()
    
    def complete(self, success, output_file=None):
        """Mark processing as complete"""
        elapsed = time.time() - self.process_start
        
        print()  # New line after progress bar
        
        status_icon = "✅" if success else "❌"
        status_text = "SUCCESS" if success else "FAILED"
        
        print(f"\n{status_icon} {status_text}")
        print(f"   ⏱️  Total time: {format_duration(elapsed)}")
        
        if output_file and output_file.exists():
            output_size = output_file.stat().st_size
            print(f"   📄 Output: {output_file.name} ({format_file_size(output_size)})")
        
        if success and self.duration > 0:
            speed_ratio = self.duration / elapsed if elapsed > 0 else 0
            print(f"   📊 Processing speed: {speed_ratio:.2f}x real-time")
        
        print()

def run_whisper_process(input_file, output_dir, original_filename, model_dir, tracker):
    """
    Run whisper-ctranslate2 with proper error handling.
    Uses ONLY valid parameters.
    Returns (success: bool, actual_output_file: Path or None)
    """
    # Build command with ONLY VALID parameters for whisper-ctranslate2
    cmd = [
        str(VENVPYTHON),
        str(WHISPER_EXE),
        str(input_file),                    # Input file (video or audio)
        '--model', 'small',                  # Model size
        '--model_directory', str(model_dir), # Local model path
        '--compute_type', 'int8',            # Quantization
        '--output_dir', str(output_dir),     # Where to save output
        '--output_format', 'vtt',            # Output format
        # NOTE: No --output_filename - it's NOT a valid parameter!
    ]
    
    print(f"🔧 Running Whisper...")
    print(f"   Input: {input_file.name}")
    print(f"   Model: small (from local directory)")
    print(f"   Output format: VTT")
    print()
    
    tracker.update(force=True)
    
    # Run the process and CAPTURE OUTPUT FOR DEBUGGING
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=None  # Let it run as long as needed
        )
        
        # Check result
        if result.returncode != 0:
            print(f"\n❌ ERROR: Whisper failed!")
            print(f"   Return code: {result.returncode}")
            print(f"\n--- STDOUT ---")
            print(result.stdout)
            print(f"\n--- STDERR ---")
            print(result.stderr)
            print("-" * 50)
            return False, None
        
        # Success! Now find what file was created
        print(f"✅ Whisper completed successfully!")
        
        # Look for .vtt files in output directory
        vtt_files = list(output_dir.glob('*.vtt'))
        
        if not vtt_files:
            print(f"⚠️  Warning: No .vtt file found in {output_dir}")
            return True, None
        
        # Get the most recently created/modified .vtt file
        latest_vtt = max(vtt_files, key=lambda p: p.stat().st_mtime)
        
        print(f"📄 Created file: {latest_vtt.name}")
        
        return True, latest_vtt
        
    except subprocess.TimeoutExpired:
        print(f"\n❌ ERROR: Process timed out!")
        return False, None
    except Exception as e:
        print(f"\n❌ EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        return False, None

def rename_output_if_needed(actual_output, expected_output, original_filename):
    """
    Rename the output file to match the original video filename.
    Returns the final output Path.
    """
    if actual_output is None:
        return expected_output  # Couldn't determine actual output
    
    # If already has correct name, great!
    if actual_output.name == f"{original_filename}.vtt":
        return actual_output
    
    # Need to rename
    final_output = expected_output  # This is where we WANT it
    
    print(f"🔧 Renaming output:")
    print(f"   From: {actual_output.name}")
    print(f"   To:   {final_output.name}")
    
    try:
        # If target exists, remove it first
        if final_output.exists():
            final_output.unlink()
        
        # Rename the file
        actual_output.rename(final_output)
        print(f"   ✅ Renamed successfully!")
        return final_output
        
    except Exception as e:
        print(f"   ⚠️  Rename failed: {e}")
        print(f"   Keeping original name: {actual_output.name}")
        return actual_output

def process_file_with_progress(file_index, total_files, file_path, model_dir):
    """
    Process a single file with detailed progress tracking.
    Handles both MP3 and video files correctly.
    """
    tracker = ProgressTracker(file_index, total_files, file_path)
    
    filename = file_path.stem
    ext = file_path.suffix.lower()
    
    tracker.start_processing()
    
    # Calculate EXPECTED output path (based on original filename)
    rel_path = file_path.relative_to(VIDEOS_DIR)
    expected_output = SUBTITLES_DIR / rel_path.with_suffix('.vtt')
    
    out_dir = expected_output.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    
    temp_audio = None
    
    try:
        # Determine input for whisper
        if ext == '.mp3':
            # MP3: Use directly
            whisper_input = file_path
            print(f"🎵 Processing MP3 directly...")
        else:
            # Video: Extract audio first
            print(f"🎬 Step 1/2: Extracting audio track...")
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
                print(f"❌ ERROR: Failed to extract audio from {file_path.name}")
                if ffmpeg_result.stderr:
                    print(f"   FFmpeg error: {ffmpeg_result.stderr[:500]}")
                tracker.complete(False)
                return False
            
            print(f"✅ Audio extracted: {temp_audio.name}")
            print()
            
            # Use extracted audio as input
            whisper_input = temp_audio
            
            print(f"🎤 Step 2/2: Running Whisper on extracted audio...")
        
        # Run Whisper (the main processing step)
        success, actual_output = run_whisper_process(
            whisper_input, 
            out_dir, 
            filename, 
            model_dir, 
            tracker
        )
        
        # Cleanup temp audio if we created one
        if temp_audio and temp_audio.exists():
            try:
                temp_audio.unlink()
                print(f"🧹 Cleaned up temp file: {temp_audio.name}")
            except:
                pass
        
        if not success:
            tracker.complete(False)
            return False
        
        # Rename output to match original filename if needed
        final_output = rename_output_if_needed(actual_output, expected_output, filename)
        
        # Complete with success
        tracker.complete(True, final_output)
        return True
        
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        
        # Cleanup temp file on error
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
    print("🎉 BATCH PROCESS COMPLETE - SUMMARY")
    print("=" * 70)
    print()
    print(f"📊 Total Files Processed: {stats['total']}")
    if stats['total'] > 0:
        print(f"✅ Successful:             {stats['success']} ({stats['success']/stats['total']*100:.1f}%)")
    print(f"❌ Failed:                  {stats['failed']}")
    print()
    print(f"⏱️  Total Runtime:           {format_duration(total_time)}")
    
    if stats['total'] > 0 and total_time > 0:
        avg_time = total_time / stats['total']
        print(f"📈 Average Time per File:   {format_duration(avg_time)}")
    
    print()
    
    if stats['failed'] > 0:
        print("⚠️  Some files failed to process. Check error messages above.")
    
    print("=" * 70)

def main():
    """Main entry point"""
    overall_start = time.time()
    
    print_header()
    check_venv()
    
    print(f"📂 Root Directory:       {ROOT_DIR}")
    print(f"📹 Videos Directory:     {VIDEOS_DIR}")
    print(f"💾 Subtitles Directory:  {SUBTITLES_DIR}")
    
    model_dir = find_model_directory()
    if model_dir:
        print(f"🤖 Whisper Model:        Found at {model_dir.parent.parent.name}")
    else:
        print("⚠️  Whisper Model:        Not found!")
        print("   The script will likely fail without a model.")
    print()
    
    choice = get_user_choice()
    
    if choice == 'A':
        target_dir = VIDEOS_DIR
        print(f"\n🔍 Scanning ALL channels...")
    else:
        channels = list_channels()
        
        if not channels:
            print("❌ ERROR: No channels found!")
            input("\nPress Enter to exit...")
            sys.exit(1)
        
        channel_name, target_dir = get_channel_name(channels)
        print(f"\n📺 Selected channel: {channel_name}")
    
    files_to_process = find_videos_needing_subtitles(target_dir)
    
    if not files_to_process:
        print("\n" + "=" * 50)
        print("✨ No missing subtitles found. Everything is up to date!")
        print("=" * 50)
        input("\nPress Enter to exit...")
        return
    
    print("\n" + "=" * 70)
    print(f"📋 Found {len(files_to_process)} files needing subtitle generation")
    print("=" * 70)
    
    total_size = sum(f.stat().st_size for f in files_to_process)
    print(f"💾 Total size to process: {format_file_size(total_size)}")
    print()
    
    confirm = input(f"▶️  Process {len(files_to_process)} files? (y/n): ").strip().lower()
    if confirm != 'y':
        print("❌ Cancelled.")
        input("\nPress Enter to exit...")
        return
    
    print()
    print("🚀 Starting processing...")
    print("=" * 70)
    print()
    
    stats = {
        'total': len(files_to_process),
        'success': 0,
        'failed': 0
    }
    
    for i, file_path in enumerate(files_to_process, 1):
        if process_file_with_progress(i, len(files_to_process), file_path, model_dir):
            stats['success'] += 1
        else:
            stats['failed'] += 1
        
        print()  # Spacer between files
    
    print_final_summary(stats, overall_start)
    
    input("\nPress Enter to exit...")

if __name__ == "__main__":
    main()