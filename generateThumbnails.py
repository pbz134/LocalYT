import os
import subprocess
import sys
import random
import shutil
import time

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
            print(f"   [!] Could not get duration for {os.path.basename(video_path)} (ffprobe error). Using default 10s.")
            return 10

        duration = float(result.stdout.strip())
        return duration if duration > 1 else 10
    except ValueError:
        print(f"   [!] Could not parse duration for {os.path.basename(video_path)}. Using default 10s.")
        return 10
    except FileNotFoundError:
        print("[!] Error: ffprobe not found. Please install FFmpeg and ensure it is in your PATH.")
        sys.exit(1)

def generate_thumbnail(video_path, thumbnail_path):
    """Generates a thumbnail for a video file."""
    duration = get_video_duration(video_path)
    
    # Calculate a random time (between 10% and 90% of duration, or similar logic to node script)
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
        # creationflags=subprocess.CREATE_NO_WINDOW prevents a black console window from flashing on Windows
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, creationflags=subprocess.CREATE_NO_WINDOW)
        print(f"   [+] Generated thumbnail for: {os.path.basename(video_path)} at {int(random_time)}s")
        return True
    except subprocess.CalledProcessError as e:
        print(f"   [-] Error generating thumbnail for {os.path.basename(video_path)}")
        return False
    except FileNotFoundError:
        print("[!] Error: ffmpeg not found. Please install FFmpeg and ensure it is in your PATH.")
        sys.exit(1)

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
        print(f"   [+] Extracted cover for: {os.path.basename(mp3_path)}")
        return True
    except subprocess.CalledProcessError:
        # Fallback: try to generate a generic thumbnail if extraction fails?
        # Or just report error.
        print(f"   [-] No cover art found or error extracting for: {os.path.basename(mp3_path)}")
        return False

def process_directory(current_dir, relative_path=""):
    """Recursively processes directories looking for media files."""
    
    try:
        entries = os.listdir(current_dir)
    except PermissionError:
        print(f"   [!] Permission denied accessing: {current_dir}")
        return
    except FileNotFoundError:
        print(f"   [!] Directory not found: {current_dir}")
        return

    for entry in entries:
        full_path = os.path.join(current_dir, entry)
        
        # Skip the thumbnails directory to avoid recursive loops
        if os.path.abspath(full_path) == os.path.abspath(THUMBNAILS_DIR):
            continue

        if os.path.isdir(full_path):
            # Recurse into subdirectory
            new_relative = os.path.join(relative_path, entry)
            process_directory(full_path, new_relative)
        
        elif os.path.isfile(full_path):
            _, ext = os.path.splitext(entry)
            
            if ext.lower() not in VIDEO_EXTENSIONS:
                continue
            
            # Construct output path
            base_name = os.path.splitext(entry)[0]
            thumb_filename = f"{base_name}.jpg"
            
            # Save in mirrored folder structure
            output_dir = os.path.join(THUMBNAILS_DIR, relative_path)
            thumb_path = os.path.join(output_dir, thumb_filename)

            # Check if thumbnail already exists
            if os.path.exists(thumb_path):
                print(f"   [=] Thumbnail exists for: {entry}")
                continue

            # Ensure output directory exists
            os.makedirs(output_dir, exist_ok=True)

            # Process based on type
            if ext.lower() == '.mp3':
                extract_mp3_cover(full_path, thumb_path)
            else:
                generate_thumbnail(full_path, thumb_path)

def main():
    print("Starting thumbnail generation...")
    start_time = time.time()

    if not os.path.exists(VIDEOS_DIR):
        print(f"Error: Videos directory not found at {VIDEOS_DIR}")
        print("Please create a 'videos' folder and add your media files to it.")
        return

    # Ensure main thumbnails directory exists
    os.makedirs(THUMBNAILS_DIR, exist_ok=True)

    print(f"Scanning: {VIDEOS_DIR}")
    
    try:
        process_directory(VIDEOS_DIR)
    except KeyboardInterrupt:
        print("\n[!] Process interrupted by user.")

    end_time = time.time()
    print(f"\nDone! Completed in {end_time - start_time:.2f} seconds.")

if __name__ == "__main__":
    main()