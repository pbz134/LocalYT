import os
import subprocess
import sys
import random
import shutil
import time
from tqdm import tqdm

# Configuration
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
VIDEOS_DIR = os.path.join(SCRIPT_DIR, 'videos')
THUMBNAILS_DIR = os.path.join(SCRIPT_DIR, 'thumbnails')

# Supported extensions
VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.mp3'}

def get_video_duration(video_path):
    """Gets the duration of a video file using ffprobe."""
    cmd = [
        'ffprobe', '-v', 'error', 
        '-show_entries', 'format=duration', 
        '-of', 'default=noprint_wrappers=1:nokey=1', 
        video_path
    ]
    try:
        # Run command and capture output
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
        
        if result.returncode != 0:
            return 10

        duration = float(result.stdout.strip())
        return duration if duration > 1 else 10
    except ValueError:
        return 10
    except FileNotFoundError:
        # We handle the ffmpeg check in the main loop, but exit here if ffprobe is missing during processing
        return 10

def generate_thumbnail(video_path, thumbnail_path):
    """Generates a thumbnail for a video file."""
    duration = get_video_duration(video_path)
    
    # Calculate a random time
    max_time = max(1, duration * 0.9)
    if max_time <= 1:
        random_time = 0
    else:
        random_time = random.uniform(1, max_time)

    cmd = [
        'ffmpeg',
        '-ss', str(random_time),
        '-i', video_path,
        '-vframes', '1',
        '-q:v', '2',
        '-y', # Overwrite
        thumbnail_path
    ]
    
    try:
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, creationflags=subprocess.CREATE_NO_WINDOW)
        return True, None
    except subprocess.CalledProcessError:
        return False, "Error generating thumbnail"
    except FileNotFoundError:
        return False, "ffmpeg not found"

def extract_mp3_cover(mp3_path, thumbnail_path):
    """Extracts embedded cover art from an MP3."""
    cmd = [
        'ffmpeg',
        '-i', mp3_path,
        '-an', '-vcodec', 'copy',
        '-y', # Overwrite
        thumbnail_path
    ]
    
    try:
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, creationflags=subprocess.CREATE_NO_WINDOW)
        return True, None
    except subprocess.CalledProcessError:
        return False, "No cover art found"
    except FileNotFoundError:
         return False, "ffmpeg not found"

def collect_files(current_dir, relative_path=""):
    """Recursively collects media files to process."""
    files_to_process = []
    
    try:
        entries = os.listdir(current_dir)
    except PermissionError:
        return [] # Skip directories we can't access
    except FileNotFoundError:
        return []

    for entry in entries:
        full_path = os.path.join(current_dir, entry)
        
        # Skip the thumbnails directory
        if os.path.abspath(full_path) == os.path.abspath(THUMBNAILS_DIR):
            continue

        if os.path.isdir(full_path):
            new_relative = os.path.join(relative_path, entry)
            files_to_process.extend(collect_files(full_path, new_relative))
        
        elif os.path.isfile(full_path):
            _, ext = os.path.splitext(entry)
            
            if ext.lower() in VIDEO_EXTENSIONS:
                # Store tuple: (full_path, entry, ext, relative_path)
                files_to_process.append((full_path, entry, ext, relative_path))
                
    return files_to_process

def main():
    print("Starting thumbnail generation...")
    start_time = time.time()

    if not os.path.exists(VIDEOS_DIR):
        print(f"Error: Videos directory not found at {VIDEOS_DIR}")
        print("Please create a 'videos' folder and add your media files to it.")
        return

    # Ensure main thumbnails directory exists
    os.makedirs(THUMBNAILS_DIR, exist_ok=True)

    # Check for FFmpeg before starting the heavy lifting
    try:
        subprocess.run(['ffmpeg', '-version'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=subprocess.CREATE_NO_WINDOW)
    except FileNotFoundError:
        print("[!] Error: ffmpeg not found. Please install FFmpeg and ensure it is in your PATH.")
        sys.exit(1)

    # 1. Collect all files first (needed for tqdm progress bar)
    print("Scanning files...")
    all_files = collect_files(VIDEOS_DIR)
    
    if not all_files:
        print("No video or audio files found to process.")
        return

    # 2. Process files with progress bar
    with tqdm(total=len(all_files), desc="Processing", unit="file", 
              bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}]") as pbar:
        
        for full_path, entry, ext, relative_path in all_files:
            # Update description to show current file
            # Truncate filename if it's too long to keep UI clean
            display_name = entry[:40] + "..." if len(entry) > 40 else entry
            pbar.set_description(f"Processing: {display_name}")
            
            # Construct output path
            base_name = os.path.splitext(entry)[0]
            thumb_filename = f"{base_name}.jpg"
            
            output_dir = os.path.join(THUMBNAILS_DIR, relative_path)
            thumb_path = os.path.join(output_dir, thumb_filename)

            # Check if thumbnail already exists
            if os.path.exists(thumb_path):
                # Just update the bar, don't log
                pbar.update(1)
                continue

            # Ensure output directory exists
            os.makedirs(output_dir, exist_ok=True)

            status_msg = None
            
            # Process based on type
            if ext.lower() == '.mp3':
                success, msg = extract_mp3_cover(full_path, thumb_path)
            else:
                success, msg = generate_thumbnail(full_path, thumb_path)
            
            # If there was an error, we can optionally write it to the bar description
            # or just let it pass silently. 
            if not success and msg:
                pbar.write(f"[!] Error with {entry}: {msg}")

            pbar.update(1)

    end_time = time.time()
    print(f"\nDone! Completed in {end_time - start_time:.2f} seconds.")

if __name__ == "__main__":
    main()