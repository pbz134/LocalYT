import os
import datetime
import sys
from pathlib import Path

# Ensure UTF-8 encoding for stdout/stderr
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

def get_file_last_modified_date(file_path):
    """Get the last modified date of a file."""
    try:
        return os.path.getmtime(file_path)
    except FileNotFoundError:
        try:
            encoded_path = os.fsencode(file_path)
            decoded_path = os.fsdecode(encoded_path)
            return os.path.getmtime(decoded_path)
        except Exception:
            raise

def create_filedates(videos_dir, filedates_dir):
    # Ensure the filedates directory exists
    if not os.path.exists(filedates_dir):
        os.makedirs(filedates_dir)

    created_count = 0
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
                status_msg = f"Processing file #{processed_count}... (Created: {created_count})"
                sys.stdout.write(status_msg.ljust(50) + "\r")
                sys.stdout.flush()
                
                file_path = os.path.join(root, filename)
                file_path = os.path.normpath(file_path)
                
                if not os.path.exists(file_path):
                    error_count += 1 
                    continue
                
                try:
                    last_modified_date = get_file_last_modified_date(file_path)
                    last_modified_date_str = datetime.datetime.fromtimestamp(last_modified_date).strftime('%d.%m.%Y')

                    relative_path = os.path.relpath(root, videos_dir)
                    filedates_subdir = os.path.join(filedates_dir, relative_path)
                    
                    if not os.path.exists(filedates_subdir):
                        os.makedirs(filedates_subdir)

                    txt_filename = os.path.splitext(filename)[0] + '.txt'
                    txt_file_path = os.path.join(filedates_subdir, txt_filename)
                    
                    if not os.path.exists(txt_file_path):
                        with open(txt_file_path, 'w', encoding='utf-8') as txt_file:
                            txt_file.write(last_modified_date_str)
                        created_count += 1
                    else:
                        skipped_count += 1

                except Exception as e:
                    print(f"\nError processing: {filename} ({e})")
                    error_count += 1

    # Clear the status line and print final summary
    sys.stdout.write(" " * 50 + "\r") 
    sys.stdout.flush()
    
    print(f"FileDates Update Complete:")
    print(f"  Total Files Scanned: {processed_count}")
    print(f"  New Dates Filed:     {created_count}")
    print(f"  Skipped (Exist):     {skipped_count}")
    
    if error_count > 0:
        print(f"  Errors:              {error_count}")

if __name__ == '__main__':
    # --- DYNAMIC PATH RESOLUTION ---
    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent
    
    videos_dir = root_dir / "videos"
    filedates_dir = root_dir / "filedates"
    # -------------------------------

    if not os.path.exists(videos_dir):
        print(f"Error: Videos directory not found at {videos_dir}")
        sys.exit(1)
        
    create_filedates(videos_dir, filedates_dir)