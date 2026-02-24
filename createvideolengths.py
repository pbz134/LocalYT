import os
import subprocess
import json
from mutagen.mp3 import MP3

def get_file_length_fast(file_path):
    """Get the length of a video or audio file in seconds (optimized)."""
    
    # For MP3 files, use mutagen
    if file_path.endswith('.mp3'):
        try:
            audio = MP3(file_path)
            return audio.info.length
        except Exception:
            return None
    
    # For video files, use ffprobe
    try:
        ffprobe_cmd = 'ffprobe'
        
        # Method 1: Try JSON output first
        cmd = [
            ffprobe_cmd,
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
            ffprobe_cmd,
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            file_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
        
        # Method 3: Try different stream selection
        cmd = [
            ffprobe_cmd,
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=duration',
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
    total_seconds = int(total_seconds)  # Convert to integer seconds
    
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    
    if hours > 0:
        # Format as HH:MM:SS for videos over 1 hour
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    else:
        # Format as MM:SS for videos under 1 hour
        return f"{minutes}:{seconds:02d}"

def get_channel_folder(file_path, videos_dir):
    """
    Extract the channel folder from the file path.
    Example: /videos/MVG/Xbox/video.mp4 -> MVG
    """
    # Get relative path from videos directory
    relative_path = os.path.relpath(file_path, videos_dir)
    
    # Split into parts
    path_parts = os.path.dirname(relative_path).split(os.sep)
    
    # First part should be the channel folder
    if path_parts and path_parts[0]:
        return path_parts[0]
    return None

def create_videolengths(videos_dir, videolengths_dir):
    """Process all video/audio files and save their lengths directly in channel folders."""
    
    # Check if videos directory exists
    if not os.path.exists(videos_dir):
        print(f"ERROR: Videos directory not found: {videos_dir}")
        return
    
    # Ensure the videolengths directory exists
    os.makedirs(videolengths_dir, exist_ok=True)

    # Count files first for progress display
    print("Scanning for files...")
    files_to_process = []
    for root, _, files in os.walk(videos_dir):
        for filename in files:
            if filename.endswith(('.mp4', '.mkv', '.mp3')):
                files_to_process.append((root, filename))
    
    file_count = len(files_to_process)
    
    if file_count == 0:
        print(f"No video/audio files found in {videos_dir}")
        return
    
    print(f"Found {file_count} files to process")
    print("Starting processing...")
    
    # Process files
    processed = 0
    successful = 0
    skipped = 0
    default_used = 0  # Counter for files where default length was used
    
    for i, (root, filename) in enumerate(files_to_process, 1):
        file_path = os.path.join(root, filename)
        
        # Show progress with percentage
        progress = f"[{i}/{file_count}]"
        
        # Get the channel folder
        channel_folder = get_channel_folder(file_path, videos_dir)
        
        if not channel_folder:
            print(f"{progress} ✗ {filename} - Could not determine channel folder")
            processed += 1
            continue
        
        # Create channel directory in videolengths folder
        channel_dir = os.path.join(videolengths_dir, channel_folder)
        os.makedirs(channel_dir, exist_ok=True)
        
        # Determine the text file name - same for all file types
        base_name = os.path.splitext(filename)[0]
        txt_filename = f"{base_name}.txt"  # Always use .txt extension
        txt_file_path = os.path.join(channel_dir, txt_filename)
        
        # Check if length file already exists
        if os.path.exists(txt_file_path):
            print(f"{progress} {filename} - Skipped (already exists)")
            processed += 1
            skipped += 1
            continue
        
        # Get file length
        file_length = get_file_length_fast(file_path)
        
        # Use default length of 3 minutes (180 seconds) if unable to determine
        if file_length is None:
            file_length = 180  # 3 minutes in seconds
            default_used += 1
            print(f"{progress} ⚠ {filename} - Using default length (3:00)")
        
        # Format the duration using the new function
        file_length_str = seconds_to_timestamp(file_length)
        
        # Write the file length to a text file
        with open(txt_file_path, 'w') as txt_file:
            txt_file.write(file_length_str)
        
        if file_length == 180:  # Check if default was used
            print(f"{progress} {filename} - {file_length_str} (default)")
        else:
            print(f"{progress} {filename} - {file_length_str}")
        
        processed += 1
        successful += 1
    
    # Summary
    print(f"\n--- Summary ---")
    print(f"Successfully processed: {successful}/{processed} files")
    print(f"Skipped (already exist): {skipped} files")
    print(f"Default length (3:00) used for: {default_used} files")
    print(f"Output directory: {videolengths_dir}")
    
    # Show channel organization
    if os.path.exists(videolengths_dir):
        channels = [d for d in os.listdir(videolengths_dir) 
                   if os.path.isdir(os.path.join(videolengths_dir, d))]
        if channels:
            print(f"Channel folders: {', '.join(channels)}")

if __name__ == '__main__':
    videos_dir = './videos'
    videolengths_dir = './videolengths'
    
    # Automatically process all files
    create_videolengths(videos_dir, videolengths_dir)