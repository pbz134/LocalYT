import os
import sys
import subprocess
import shutil
import re
import struct
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed

# Optional: Check if Pillow is available
try:
    from PIL import Image
    import io
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("Warning: Pillow not found.")

# --- CONFIGURATION ---
MAX_WORKERS = os.cpu_count() or 4 
# ---------------------

def safe_makedirs(path):
    try:
        os.makedirs(path, exist_ok=True)
        return True
    except Exception:
        return False

def format_time(seconds):
    """Formats seconds to HH:MM:SS.mmm string"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"

def get_video_duration_fast(video_path):
    """Fast duration check using ffprobe."""
    try:
        cmd = [
            'ffprobe', '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'csv=p=0',
            str(video_path)
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return float(result.stdout.strip())
    except Exception:
        return 0.0

def process_single_video(args):
    """
    Optimized Worker: Uses Single-Pass FFmpeg + Piping to avoid Disk I/O.
    Returns a tuple: (status_string, filename_for_logging)
    """
    root, filename, output_subdir, skip_check = args
    
    video_name = os.path.splitext(filename)[0]
    
    # Sanitize name
    safe_video_name = re.sub(r'[^\w\s-]', '', video_name).strip()
    
    vtt_filename = f"{safe_video_name}.vtt"
    sprite_filename = f"{safe_video_name}SpriteImg.jpg"
    
    vtt_file_path = os.path.join(output_subdir, vtt_filename)
    sprite_file_path = os.path.join(output_subdir, sprite_filename)

    # 1. Skip Check
    if skip_check and os.path.exists(vtt_file_path) and os.path.exists(sprite_file_path):
        return ("skipped", filename)

    # Ensure dir exists
    safe_makedirs(output_subdir)
    video_full_path = os.path.join(root, filename)
    
    # 2. Generate Thumbnails Logic
    try:
        duration = get_video_duration_fast(video_full_path)
        if duration <= 0:
            return ("error", filename)

        thumb_width = 160 
        interval = 5
        
        num_frames = int(duration // interval)
        if num_frames > 200: 
            num_frames = 200
        if num_frames <= 0:
            return ("error", filename)

        # Construct select filter string for single-pass extraction
        select_expr = "+".join([f"between(t,{i*interval},{i*interval+0.01})" for i in range(num_frames)])
        
        cmd = [
            'ffmpeg', '-ss', '0', '-i', str(video_full_path),
            '-vf', f"select='{select_expr}',scale={thumb_width}:-1",
            '-vframes', str(num_frames),
            '-f', 'image2pipe',
            '-vcodec', 'bmp',
            '-'
        ]
        
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        
        images = []
        frames_data = []
        
        byte_stream = process.stdout
        
        while True:
            header = byte_stream.read(54)
            if len(header) < 54:
                break
            if header[:2] != b'BM':
                break
                
            size = struct.unpack('<I', header[2:6])[0]
            remaining = size - 54
            img_data = header + byte_stream.read(remaining)
            
            if len(img_data) < size:
                break
                
            try:
                img = Image.open(io.BytesIO(img_data))
                images.append(img)
                frames_data.append({
                    'start': format_time(len(images)-1 * interval), 
                    'end': format_time(min(len(images) * interval, duration))
                })
            except Exception:
                continue

        process.wait()
        
        if not images:
            return ("error", filename)

        # Create Sprite
        max_height = max(im.height for im in images)
        total_width = sum(im.width for im in images)
        
        sprite = Image.new('RGB', (total_width, max_height))
        x_offset = 0
            
        for i, im in enumerate(images):
            sprite.paste(im, (x_offset, 0))
            frames_data[i]['x'] = x_offset
            frames_data[i]['y'] = 0
            frames_data[i]['w'] = im.width
            frames_data[i]['h'] = im.height
            x_offset += im.width
        
        sprite.save(str(sprite_file_path), 'JPEG')

        # Write VTT
        vtt_content = "WEBVTT\n\n"
        for f in frames_data:
            vtt_content += f"{f['start']} --> {f['end']}\n{sprite_filename}#xywh={f['x']},{f['y']},{f['w']},{f['h']}\n\n"
        
        with open(str(vtt_file_path), 'w', encoding='utf-8') as f:
            f.write(vtt_content)
            
        return ("created", filename)

    except Exception as e:
        # print(f"Error {filename}: {e}")
        return ("error", filename)

def scan_videos_directory(videos_dir, thumbnails_dir, skip_existing=True):
    
    safe_makedirs(thumbnails_dir)
    print("Scanning for media files...", end="\r")
    
    tasks = [] 
    
    if not os.path.exists(videos_dir):
        print(f"Error: Videos directory not found at {videos_dir}")
        return

    valid_extensions = ('.mp4', '.mkv', '.webm', '.avi', '.mov')
    
    for root, _, files in os.walk(videos_dir):
        for filename in files:
            if filename.lower().endswith(valid_extensions):
                
                relative_path = os.path.relpath(root, videos_dir)
                path_parts = relative_path.split(os.sep)
                
                if not path_parts or (path_parts[0] == '.' and len(path_parts) < 2):
                    continue
                
                output_subdir = os.path.join(thumbnails_dir, relative_path)
                tasks.append((root, filename, output_subdir, skip_existing))

    total_files = len(tasks)
    if total_files == 0:
        print("No video files found.                                       ")
        return

    created_count = 0
    skipped_count = 0
    error_count = 0
    
    print(f"Starting Processing with {MAX_WORKERS} workers...")

    # --- MULTI-PROCESS EXECUTION ---
    with ProcessPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(process_single_video, task): task for task in tasks}
        
        done_count = 0
        for future in as_completed(futures):
            done_count += 1
            result, fname = future.result() # Unpack tuple
            
            if result == "created": 
                created_count += 1
            elif result == "skipped": 
                skipped_count += 1
            else: 
                error_count += 1
            
            # --- UPDATED STATUS LINE ---
            # We now include the current filename (fname) in the log output.
            # Using .ljust(70) ensures we overwrite previous long filenames cleanly on the same line.
            
            status_msg = (
                f"[{done_count}/{total_files}] "
                f"Current: {fname} "
                f"(New: {created_count}, Skip: {skipped_count}, Err: {error_count})"
            )
            
            sys.stdout.write(status_msg.ljust(80) + "\r")
            sys.stdout.flush()

    print(f"\nThumbnail Sprite Update Complete:")
    print(f"  Total Files Scanned:  {total_files}")
    print(f"  New Sprites Created:  {created_count}")
    print(f"  Skipped (Exist):      {skipped_count}")
    if error_count > 0: print(f"  Errors:               {error_count}")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Generate Thumbnail Sprites (Optimized)')
    parser.add_argument('--overwrite', action='store_true', help='Overwrite existing files')
    parser.add_argument('--workers', type=int, default=None, help='Number of workers (default: CPU Count)')
    args = parser.parse_args()
    
    if args.workers:
        MAX_WORKERS = args.workers
        
    skip_existing = not args.overwrite

    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent
    
    videos_dir = root_dir / "videos"
    thumbnails_dir = root_dir / "thumbnails"
    
    scan_videos_directory(videos_dir, thumbnails_dir, skip_existing=skip_existing)