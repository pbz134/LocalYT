import os
import subprocess
import json
import sys
from pathlib import Path
from mutagen.mp3 import MP3

def get_file_length_fast(file_path):
    """Get the length of a video or audio file in seconds (optimized)."""
    
    # For MP3 files, use mutagen (faster)
    if file_path.endswith('.mp3'):
        try:
            audio = MP3(file_path)
            return audio.info.length
        except Exception:
            return None
    
    # For video files, use ffprobe
    try:
        # Method 1: Try JSON output first
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'json',
            file_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        
        if result.returncode == 0 and result.stdout:
            data = json.loads(result.stdout)
            return float(data['format']['duration'])
        
        # Method 2: Try simpler output format
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            file_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
            
        return None
        
    except (subprocess.TimeoutExpired, json.JSONDecodeError, ValueError, Exception):
        return None

def seconds_to_timestamp(total_seconds):
    """Convert seconds to HH:MM:SS or MM:SS format."""
    total_seconds = int(total_seconds) 
    
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    
    if hours > 0:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    else:
        return f"{minutes}:{seconds:02d}"

def get_channel_folder(file_path, videos_dir):
    """
    Extract the channel folder from the file path.
    Example: /videos/MVG/Xbox/video.mp4 -> MVG
    """
    relative_path = os.path.relpath(file_path, videos_dir)
    path_parts = os.path.dirname(relative_path).split(os.sep)
    
    if path_parts and path_parts[0]:
        return path_parts[0]
    return None

def create_videolengths(videos_dir, videolengths_dir):
    """Process all video/audio files and save their lengths directly in channel folders."""
    
    # Check if videos directory exists
    if not os.path.exists(videos_dir):
        print(f"Error: Videos directory not found at {videos_dir}")
        return
    
    # Ensure the videolengths directory exists
    os.makedirs(videolengths_dir, exist_ok=True)

    # Count files first for progress display
    print("Scanning for media files...", end="\r")
    files_to_process = []
    for root, _, files in os.walk(videos_dir):
        for filename in files:
            if filename.endswith(('.mp4', '.mkv', '.mp3')):
                files_to_process.append((root, filename))
    
    total_files = len(files_to_process)
    
    if total_files == 0:
        print("No video/audio files found.                                       ")
        return

    # Stats tracking
    created_count = 0
    skipped_count = 0
    default_used_count = 0
    error_count = 0
    
    for i, (root, filename) in enumerate(files_to_process, 1):
        
        # Update live counter
        status_msg = f"Processing file #{i}/{total_files}... (Created: {created_count})"
        sys.stdout.write(status_msg.ljust(65) + "\r")
        sys.stdout.flush()
        
        file_path = os.path.join(root, filename)
        
        # Get the channel folder
        channel_folder = get_channel_folder(file_path, videos_dir)
        
        if not channel_folder:
            error_count += 1
            continue
        
        # Create channel directory in videolengths folder
        channel_dir = os.path.join(videolengths_dir, channel_folder)
        os.makedirs(channel_dir, exist_ok=True)
        
        base_name = os.path.splitext(filename)[0]
        txt_filename = f"{base_name}.txt"
        txt_file_path = os.path.join(channel_dir, txt_filename)
        
        # Check if length file already exists
        if os.path.exists(txt_file_path):
            skipped_count += 1
            continue
        
        # Get file length
        file_length = get_file_length_fast(file_path)
        
        # Use default length of 3 minutes (180 seconds) if unable to determine
        is_default = False
        if file_length is None:
            file_length = 180 
            default_used_count += 1
            is_default = True
            
            # Print specific warning for defaults on a new line so it's visible
            print(f"\nWarning: Could not read duration for '{filename}', using default 3:00")
            # Re-print progress indicator on next line to keep UI clean
            sys.stdout.write(status_msg.ljust(65) + "\r")

        # Format the duration
        file_length_str = seconds_to_timestamp(file_length)
        
        # Write the file length to a text file
        try:
            with open(txt_file_path, 'w') as txt_file:
                txt_file.write(file_length_str)
            created_count += 1
        except Exception as e:
            print(f"\nError writing file for {filename}: {e}")
            error_count += 1

    # Clear status line and print final summary
    sys.stdout.write(" " * 65 + "\r") 
    sys.stdout.flush()
    
    print(f"VideoLengths Update Complete:")
    print(f"  Total Files Scanned: {total_files}")
    print(f"  New Lengths Created:  {created_count}")
    print(f"  Skipped (Exist):      {skipped_count}")
    
    if default_used_count > 0:
        print(f"  Defaults Used (3:00): {default_used_count} (Check warnings above)")
        
    if error_count > 0:
        print(f"  Errors:               {error_count}")

if __name__ == '__main__':
    # --- DYNAMIC PATH RESOLUTION ---
    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent
    
    videos_dir = root_dir / "videos"
    videolengths_dir = root_dir / "videolengths"
    # -------------------------------
    
    create_videolengths(videos_dir, videolengths_dir)