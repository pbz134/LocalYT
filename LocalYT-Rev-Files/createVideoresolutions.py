import os
import subprocess
import json
import sys
from pathlib import Path

def get_video_resolution(file_path):
    """
    Get the resolution and codec of a video file using ffprobe.
    Returns (width, height, codec_name) tuple or None if unable to determine.
    """
    try:
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height,codec_name',
            '-of', 'json',
            file_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        
        if result.returncode == 0 and result.stdout:
            data = json.loads(result.stdout)
            streams = data.get('streams', [])
            
            if streams and len(streams) > 0:
                width = int(streams[0].get('width', 0))
                height = int(streams[0].get('height', 0))
                codec = streams[0].get('codec_name', 'unknown')
                
                if width > 0 and height > 0:
                    return (width, height, codec)
        
        return None
        
    except (subprocess.TimeoutExpired, json.JSONDecodeError, ValueError, Exception):
        return None

def classify_resolution(width, height):
    """
    Classify video resolution into categories.
    
    Categories:
    - 4k: 2160p or higher (3840x2160 or larger)
    - 2k: 1440p (2560x1440)
    - HD: 1080p (1920x1080) or 720p (1280x720)
    - SD: Anything lower than 720p
    
    Returns: string classification
    """
    max_dim = max(width, height)
    
    if max_dim >= 2160:
        return "4K"
    elif max_dim >= 1440:
        return "2K"
    elif max_dim >= 1280:  # Covers 720p (1280x720) and above up to 2K
        return "HD"
    else:
        return "SD"

def get_relative_base(file_path, videos_dir):
    """
    Get relative base path without extension.
    Example: /videos/MVG/Xbox/video.mp4 -> MVG/Xbox/video
    """
    relative_path = os.path.relpath(file_path, videos_dir).replace(os.sep, '/')
    base_name = os.path.splitext(relative_path)[0]
    return base_name

def create_videoresolutions(videos_dir, output_dir):
    """Process all video files and save their resolution classifications and codecs."""
    
    if not os.path.exists(videos_dir):
        print(f"Error: Videos directory not found at {videos_dir}")
        return
    
    os.makedirs(output_dir, exist_ok=True)

    print("Scanning for video files...", end="\r")
    files_to_process = []
    for root, _, files in os.walk(videos_dir):
        for filename in files:
            if filename.startswith('._'):
                continue
            if filename.endswith(('.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm')):
                files_to_process.append((root, filename))
    
    total_files = len(files_to_process)
    
    if total_files == 0:
        print("No video files found.                                       ")
        return

    created_count = 0
    skipped_count = 0
    error_count = 0
    res_counts = {"4K": 0, "2K": 0, "HD": 0, "SD": 0}
    
    for i, (root, filename) in enumerate(files_to_process, 1):
        status_msg = f"Processing file #{i}/{total_files}... (Created: {created_count})"
        sys.stdout.write(status_msg.ljust(70) + "\r")
        sys.stdout.flush()
        
        file_path = os.path.join(root, filename)
        relative_base = get_relative_base(file_path, videos_dir)
        
        if not relative_base:
            error_count += 1
            continue
        
        txt_file_path = os.path.join(output_dir, f"{relative_base}.txt")
        os.makedirs(os.path.dirname(txt_file_path), exist_ok=True)
        
        if os.path.exists(txt_file_path):
            skipped_count += 1
            continue
        
        # Get video resolution and codec
        info = get_video_resolution(file_path)
        
        if info:
            width, height, codec = info
            resolution_class = classify_resolution(width, height)
            res_counts[resolution_class] = res_counts.get(resolution_class, 0) + 1
        else:
            resolution_class = "Unknown"
            codec = "unknown"
            error_count += 1
            print(f"\nWarning: Could not read resolution/codec for '{filename}', marking as Unknown/unknown")
            sys.stdout.write(status_msg.ljust(70) + "\r")

        try:
            with open(txt_file_path, 'w') as txt_file:
                txt_file.write(resolution_class + "\n" + codec)
            created_count += 1
        except Exception as e:
            print(f"\nError writing file for {filename}: {e}")
            error_count += 1

    sys.stdout.write(" " * 70 + "\r") 
    sys.stdout.flush()
    
    print(f"VideoResolutions Update Complete:")
    print(f"  Total Files Scanned:   {total_files}")
    print(f"  New Resolutions Created:{created_count}")
    print(f"  Skipped (Exist):       {skipped_count}")
    if error_count > 0:
        print(f"  Errors/Unknown:         {error_count} (Check warnings above)")
    print(f"\n  Resolution Breakdown:")
    for res_type in ["4K", "2K", "HD", "SD"]:
        count = res_counts.get(res_type, 0)
        print(f"    {res_type}: {count}")

if __name__ == '__main__':
    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent
    videos_dir = root_dir / "videos"
    videoresolutions_dir = root_dir / "videoresolutions"
    create_videoresolutions(videos_dir, videoresolutions_dir)