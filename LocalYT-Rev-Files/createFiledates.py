import os
import datetime
import sys
import subprocess
import json
from pathlib import Path

# Ensure UTF-8 encoding for stdout/stderr
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

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
            '-show_format', 
            '-show_streams', 
            file_path
        ]
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8')
        
        if result.returncode == 0:
            metadata = json.loads(result.stdout)
            
            tags = metadata.get('streams', [{}])[0].get('tags', {})
            creation_time = tags.get('creation_time')
            
            if not creation_time:
                tags = metadata.get('format', {}).get('tags', {})
                creation_time = tags.get('creation_time')
            
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

def create_filedates(videos_dir, filedates_dir):
    # Ensure the filedates directory exists
    if not os.path.exists(filedates_dir):
        os.makedirs(filedates_dir)

    created_count = 0
    updated_count = 0  # Counter for overwritten dates
    error_count = 0
    skipped_count = 0
    processed_count = 0

    print(f"Scanning {videos_dir}...", end="\r")

    # Recursively scan all .mp4, .mkv and .mp3 files
    for root, _, files in os.walk(videos_dir):
        for filename in files:
            if filename.endswith(('.mp4', '.mkv', '.mp3')):
                
                # Update live counter
                processed_count += 1
                status_msg = f"Processing file #{processed_count}... (Created: {created_count} | Updated: {updated_count})"
                sys.stdout.write(status_msg.ljust(70) + "\r")
                sys.stdout.flush()
                
                file_path = os.path.join(root, filename)
                file_path = os.path.normpath(file_path)
                
                if not os.path.exists(file_path):
                    error_count += 1 
                    continue
                
                try:
                    # Get the datetime object (not yet formatted)
                    new_date_obj = get_best_file_date(file_path)
                    new_date_str = new_date_obj.strftime('%d.%m.%Y')

                    relative_path = os.path.relpath(root, videos_dir)
                    filedates_subdir = os.path.join(filedates_dir, relative_path)
                    
                    if not os.path.exists(filedates_subdir):
                        os.makedirs(filedates_subdir)

                    txt_filename = os.path.splitext(filename)[0] + '.txt'
                    txt_file_path = os.path.join(filedates_subdir, txt_filename)
                    
                    # --- NEW OVERWRITE LOGIC ---
                    if os.path.exists(txt_file_path):
                        # Read existing date and compare
                        with open(txt_file_path, 'r', encoding='utf-8') as txt_file:
                            existing_date_str = txt_file.read().strip()
                        
                        try:
                            # Parse the DD.MM.YYYY string back into a datetime object for comparison
                            existing_date_obj = datetime.datetime.strptime(existing_date_str, '%d.%m.%Y')
                            
                            if new_date_obj < existing_date_obj:
                                # New date is strictly older -> Overwrite
                                with open(txt_file_path, 'w', encoding='utf-8') as txt_file:
                                    txt_file.write(new_date_str)
                                updated_count += 1
                            else:
                                # Existing date is older or the same -> Keep it
                                skipped_count += 1
                        except ValueError:
                            # Fallback if the existing .txt file contains unexpected text/bad format
                            # Overwrite it with the valid new date
                            with open(txt_file_path, 'w', encoding='utf-8') as txt_file:
                                txt_file.write(new_date_str)
                            updated_count += 1
                    else:
                        # No existing file -> Create new
                        with open(txt_file_path, 'w', encoding='utf-8') as txt_file:
                            txt_file.write(new_date_str)
                        created_count += 1

                except Exception as e:
                    print(f"\nError processing: {filename} ({e})")
                    error_count += 1

    # Clear the status line and print final summary
    sys.stdout.write(" " * 70 + "\r") 
    sys.stdout.flush()
    
    print(f"FileDates Update Complete:")
    print(f"  Total Files Scanned: {processed_count}")
    print(f"  New Dates Filed:     {created_count}")
    print(f"  Dates Updated:       {updated_count}") # Show updates in summary
    print(f"  Skipped (Exist):     {skipped_count}")
    
    if error_count > 0:
        print(f"  Errors:              {error_count}")

if __name__ == '__main__':
    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent
    
    videos_dir = root_dir / "videos"
    filedates_dir = root_dir / "filedates"

    if not os.path.exists(videos_dir):
        print(f"Error: Videos directory not found at {videos_dir}")
        sys.exit(1)
        
    create_filedates(videos_dir, filedates_dir)