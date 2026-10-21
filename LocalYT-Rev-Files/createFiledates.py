import os
import datetime
import sys
import subprocess
import json
import threading
import shutil
from pathlib import Path
from collections import defaultdict
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
            'errors': 0,
            'deleted': 0,
            'moved': 0,
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
            creation_time = None
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

def parse_filedate_date(date_str):
    """Parse 'DD.MM.YYYY' into a comparable tuple. Invalid → (0,0,0)."""
    try:
        parts = date_str.strip().split('.')
        if len(parts) == 3:
            return (int(parts[2]), int(parts[1]), int(parts[0]))
    except (ValueError, IndexError):
        pass
    return (0, 0, 0)

def process_single_file(file_path, videos_dir, filedates_dir):
    """Processes a single media file and updates/writes its corresponding .txt date file."""
    filename = os.path.basename(file_path)
    
    counters.increment('processed')
    processed = counters.get('processed')
    created = counters.get('created')
    updated = counters.get('updated')
    skipped = counters.get('skipped')
    
    sys.stdout.write(f"\rProcessing file #{processed}... (Created: {created} | Updated: {updated} | Skipped: {skipped})")
    sys.stdout.flush()

    try:
        # Determine the expected .txt file path first
        relative_path = os.path.relpath(os.path.dirname(file_path), videos_dir)
        filedates_subdir = os.path.join(filedates_dir, relative_path)
        txt_filename = os.path.splitext(filename)[0] + '.txt'
        txt_file_path = os.path.join(filedates_subdir, txt_filename)

        # --- EARLY SKIP LOGIC ---
        # If the filedate text file already exists, skip ffprobe and processing entirely
        if os.path.exists(txt_file_path):
            counters.increment('skipped')
            return

        # Only run the expensive ffprobe check if the filedate doesn't exist yet
        new_date_obj = get_best_file_date(file_path)
        new_date_str = new_date_obj.strftime('%d.%m.%Y')

        # Thread-safe directory creation
        os.makedirs(filedates_subdir, exist_ok=True)
        
        # --- OVERWRITE LOGIC (Will only hit if .txt didn't exist previously) ---
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

def resolve_duplicate_filedates(filedates_dir, videos_dir):
    """
    Post-processing step.

    For each channel, find .txt files that share a basename but live in different
    places (channel root vs. a playlist subfolder). These represent the same video
    whose filedate was generated at multiple physical locations over time.

    Keep only the EARLIEST date, ensure it lives at the playlist subfolder (where
    the video actually is), and delete later duplicates.

    Safety: only consolidates when the root .txt has no matching video file in
    videos/<channel>/ (i.e. it's stale) and at least one playlist .txt is backed
    by a real video file. Prevents merging two genuinely different videos that
    happen to share a basename.
    """
    if not os.path.isdir(filedates_dir):
        return

    print("Resolving duplicate filedates (root vs. playlist folders; this could take a while)...")

    for channel_entry in os.scandir(filedates_dir):
        if not channel_entry.is_dir() or channel_entry.name.startswith('._'):
            continue

        channel_name = channel_entry.name
        channel_dir = channel_entry.path
        channel_videos_dir = os.path.join(videos_dir, channel_name)

        # basename -> [entry, ...]
        basename_to_entries = defaultdict(list)

        for root, _, files in os.walk(channel_dir):
            for fname in files:
                if not fname.endswith('.txt') or fname.startswith('._'):
                    continue

                full = os.path.join(root, fname)
                rel = os.path.relpath(full, channel_dir)
                is_root = os.sep not in rel

                try:
                    with open(full, 'r', encoding='utf-8') as fh:
                        date_str = fh.read().strip()
                except Exception:
                    continue
                if not date_str:
                    continue

                # Does a corresponding video file actually exist for this .txt?
                rel_no_ext = rel[:-4]
                has_video = any(
                    os.path.exists(os.path.join(channel_videos_dir, rel_no_ext + ext))
                    for ext in ('.mp4', '.mkv', '.mp3')
                )

                basename_to_entries[fname].append({
                    'path': full,
                    'date_str': date_str,
                    'parsed': parse_filedate_date(date_str),
                    'is_root': is_root,
                    'has_video': has_video,
                })

        for basename, entries in basename_to_entries.items():
            if len(entries) < 2:
                continue

            root_entries = [e for e in entries if e['is_root']]
            playlist_entries = [e for e in entries if not e['is_root']]

            # Only act when both a root copy AND at least one playlist copy exist
            if not root_entries or not playlist_entries:
                continue

            # Safety: skip if the root .txt still has a real video (two different
            # videos sharing a basename), or if no playlist copy is backed by a
            # real video file.
            if any(e['has_video'] for e in root_entries):
                continue
            if not any(e['has_video'] for e in playlist_entries):
                continue

            # Earliest date = original upload date. Later dates are regenerated.
            earliest = min(entries, key=lambda e: e['parsed'])

            # Target: a real playlist subfolder (prefer the earliest-dated one).
            real_playlists = [e for e in playlist_entries if e['has_video']]
            target = min(real_playlists, key=lambda e: e['parsed'])

            # Delete every entry that isn't the earliest's source and isn't the target.
            for e in entries:
                if e['path'] == earliest['path'] or e['path'] == target['path']:
                    continue
                try:
                    os.remove(e['path'])
                    counters.increment('deleted')
                except Exception as err:
                    print(f"\nCould not delete {e['path']}: {err}")

            if earliest['path'] != target['path']:
                # Earliest is at the root — replace the playlist's later-dated copy.
                try:
                    os.replace(earliest['path'], target['path'])
                    counters.increment('moved')
                except OSError:
                    # Cross-device fallback (shouldn't happen inside filedates/)
                    try:
                        shutil.move(earliest['path'], target['path'])
                        counters.increment('moved')
                    except Exception as err:
                        print(f"\nCould not move {earliest['path']} → {target['path']}: {err}")
            else:
                # Earliest is already at the playlist — clean up any stray root copies.
                for e in root_entries:
                    if os.path.exists(e['path']):
                        try:
                            os.remove(e['path'])
                            counters.increment('deleted')
                        except Exception:
                            pass

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

    # NEW: consolidate duplicates between root and playlist folders
    resolve_duplicate_filedates(str(filedates_dir), str(videos_dir))

    # Clear the status line
    sys.stdout.write("\r\033[K")
    sys.stdout.flush()

    print(f"FileDates Update Complete:")
    print(f"  Total Files Scanned: {counters.get('processed')}")
    print(f"  New Dates Filed:     {counters.get('created')}")
    print(f"  Dates Updated:       {counters.get('updated')}")
    print(f"  Skipped (Exist):     {counters.get('skipped')}")
    if counters.get('deleted') > 0:
        print(f"  Duplicates Deleted:  {counters.get('deleted')}")
    if counters.get('moved') > 0:
        print(f"  Dates Moved:         {counters.get('moved')}")
    if counters.get('errors') > 0:
        print(f"  Errors:              {counters.get('errors')}")