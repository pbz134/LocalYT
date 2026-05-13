import os
import datetime
import sys
import subprocess
import json
import threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# Ensure UTF-8 encoding for stdout/stderr
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# Thread-safe counters
class AtomicCounters:
    def __init__(self):
        self.lock = threading.Lock()
        self.counts = {
            'processed': 0,
            'created': 0,
            'updated': 0,
            'skipped': 0,
            'errors': 0
        }

    def increment(self, key, amount=1):
        with self.lock:
            self.counts[key] += amount

    def get(self, key):
        with self.lock:
            return self.counts[key]

counters = AtomicCounters()

def get_best_file_date(file_path):
    """
    Hierarchy:
    1. Internal Metadata 'creation_time' (via ffprobe)
    2. File System Creation Date (OS Erstelldatum)
    3. File System Modified Date (Letzter Fallback)
    """
    date_to_use = None

    # --- FALLBACK 1: Internal Metadata (Jahr / creation_time) ---
    try:
        command = [
            'ffprobe', 
            '-v', 'quiet', 
            '-print_format', 'json', 
            # Only fetch the specific tags we need to speed up ffprobe parsing
            '-show_entries', 'format_tags=creation_time:stream_tags=creation_time',
            file_path
        ]
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8')
        
        if result.returncode == 0:
            metadata = json.loads(result.stdout)
            
            # Check streams first
            for stream in metadata.get('streams', []):
                creation_time = stream.get('tags', {}).get('creation_time')
                if creation_time:
                    break
            
            # If not in streams, check format
            if not creation_time:
                creation_time = metadata.get('format', {}).get('tags', {}).get('creation_time')
            
            if creation_time:
                clean_time = creation_time.split('.')[0].replace('Z', '')
                date_to_use = datetime.datetime.strptime(clean_time, '%Y-%m-%dT%H:%M:%S')
    except Exception:
        pass

    # --- FALLBACK 2: File System Creation Date ("Medium erstellt") ---
    if date_to_use is None:
        try:
            stat = os.stat(file_path)
            if sys.platform == 'win32':
                creation_ts = stat.st_ctime
            else:
                creation_ts = getattr(stat, 'st_birthtime', stat.st_ctime)
            
            date_to_use = datetime.datetime.fromtimestamp(creation_ts)
        except Exception:
            pass

    # --- FALLBACK 3: File System Modified Date (Last Resort) ---
    if date_to_use is None:
        try:
            mod_time = os.path.getmtime(file_path)
            date_to_use = datetime.datetime.fromtimestamp(mod_time)
        except Exception:
             date_to_use = datetime.datetime.now()

    return date_to_use

def process_single_file(file_path, videos_dir, filedates_dir):
    """Processes a single media file and updates/writes its corresponding .txt date file."""
    filename = os.path.basename(file_path)
    
    counters.increment('processed')
    processed = counters.get('processed')
    created = counters.get('created')
    updated = counters.get('updated')
    
    # \033[K clears the line in the terminal to prevent text artifacts from line lengths changing
    sys.stdout.write(f"\r\033[KProcessing file #{processed}... (Created: {created} | Updated: {updated})")
    sys.stdout.flush()

    try:
        new_date_obj = get_best_file_date(file_path)
        new_date_str = new_date_obj.strftime('%d.%m.%Y')

        relative_path = os.path.relpath(os.path.dirname(file_path), videos_dir)
        filedates_subdir = os.path.join(filedates_dir, relative_path)
        
        # Thread-safe directory creation
        os.makedirs(filedates_subdir, exist_ok=True)

        txt_filename = os.path.splitext(filename)[0] + '.txt'
        txt_file_path = os.path.join(filedates_subdir, txt_filename)
        
        # --- OVERWRITE LOGIC ---
        if os.path.exists(txt_file_path):
            with open(txt_file_path, 'r', encoding='utf-8') as txt_file:
                existing_date_str = txt_file.read().strip()
            
            try:
                existing_date_obj = datetime.datetime.strptime(existing_date_str, '%d.%m.%Y')
                
                if new_date_obj < existing_date_obj:
                    with open(txt_file_path, 'w', encoding='utf-8') as txt_file:
                        txt_file.write(new_date_str)
                    counters.increment('updated')
                else:
                    counters.increment('skipped')
            except ValueError:
                with open(txt_file_path, 'w', encoding='utf-8') as txt_file:
                    txt_file.write(new_date_str)
                counters.increment('updated')
        else:
            with open(txt_file_path, 'w', encoding='utf-8') as txt_file:
                txt_file.write(new_date_str)
            counters.increment('created')

    except Exception as e:
        # Print error on a new line so it doesn't mess up the live counter
        print(f"\nError processing: {filename} ({e})")
        counters.increment('errors')

def create_filedates(videos_dir, filedates_dir, max_workers=16):
    # Ensure the filedates directory exists
    os.makedirs(filedates_dir, exist_ok=True)

    print(f"Scanning {videos_dir} for media files...")

    # 1. Gather all files first (This is fast)
    files_to_process = []
    for root, _, files in os.walk(videos_dir):
        for filename in files:
            if filename.endswith(('.mp4', '.mkv', '.mp3')):
                file_path = os.path.normpath(os.path.join(root, filename))
                if os.path.exists(file_path):
                    files_to_process.append(file_path)

    total_files = len(files_to_process)
    print(f"Found {total_files} media files. Starting multi-threaded processing ({max_workers} threads)...")

    # 2. Process files concurrently
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks
        futures = [
            executor.submit(process_single_file, file_path, videos_dir, filedates_dir)
            for file_path in files_to_process
        ]
        
        # Wait for all tasks to complete
        for future in as_completed(futures):
            # This ensures we catch any unhandled exceptions from the threads
            try:
                future.result()
            except Exception as e:
                print(f"\nThread error: {e}")
                counters.increment('errors')

    # Clear the status line and print final summary
    sys.stdout.write("\r\033[K") 
    sys.stdout.flush()
    
    print(f"FileDates Update Complete:")
    print(f"  Total Files Scanned: {counters.get('processed')}")
    print(f"  New Dates Filed:     {counters.get('created')}")
    print(f"  Dates Updated:       {counters.get('updated')}")
    print(f"  Skipped (Exist):     {counters.get('skipped')}")
    
    if counters.get('errors') > 0:
        print(f"  Errors:              {counters.get('errors')}")

if __name__ == '__main__':
    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent
    
    videos_dir = root_dir / "videos"
    filedates_dir = root_dir / "filedates"

    if not os.path.exists(videos_dir):
        print(f"Error: Videos directory not found at {videos_dir}")
        sys.exit(1)
        
    # You can adjust max_workers. 16 is a safe default for I/O bound tasks.
    # If your disk is an HDD, 8 might be faster. If it's an NVMe SSD, you can push this to 32+.
    create_filedates(videos_dir, filedates_dir, max_workers=16)