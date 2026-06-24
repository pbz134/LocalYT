import os
import sys
from pathlib import Path

def get_progress_bar(current, total, width=20):
    """Generate a simple progress bar string."""
    if total == 0:
        return "[" + " " * width + "]"
    
    filled = int((current / total) * width)
    bar = "=" * filled + " " * (width - filled)
    return f"[{bar}]"

def rename_files():
    # Define the character mapping based on your description
    char_mapping = {
        '▀': 'ß',  # Wrong character to correct ß
        'õ': 'ä',  # Wrong character to correct ä
        '÷': 'ö',  # Wrong character to correct ö
        '³': 'ü',  # Wrong character to correct ü
        '–': '-'   # Wrong character to correct -
    }
    
    # Define the folders to scan (relative to parent directory)
    folders_to_scan = [
        'comments',
        'livechats',
        'channelbanner',
        'channelpic',
        'channelstats',
        'channeldesc',
        'descriptions',
        'filedates',
        'filenames',
        'subcount',
        'thumbnails',
        'videos',
        'videostats',
        'viewcounts',
        'subtitles'
    ]
    
    # Get the directory where the script is located
    script_dir = Path(__file__).resolve().parent
    # Go up one level from the script directory (LocalYT-Rev-Files) to reach the parent
    base_dir = script_dir.parent
    
    print("LocalYT Metadata Filename Character Fixer")
    print("=" * 50)
    print(f"Scanning from: {base_dir}")
    print("Mapping: '▀'→'ß', 'õ'→'ä', '÷'→'ö', '³'→'ü', '–'→'-'")
    
    # Pre-scan to count all files for progress
    sys.stdout.write("Scanning files...".ljust(70) + "\r")
    sys.stdout.flush()
    
    files_to_check = []
    for folder_name in folders_to_scan:
        folder_path = base_dir / folder_name
        
        if not folder_path.exists():
            continue
        
        for root, dirs, files in os.walk(folder_path):
            for filename in files:
                files_to_check.append((Path(root), filename))
    
    total_files = len(files_to_check)
    
    if total_files == 0:
        print("No files found to scan.                                    ")
        return

    # Counters for statistics
    files_renamed = 0
    conflict_skipped = 0
    error_count = 0
    
    # Process each file
    for i, (root, filename) in enumerate(files_to_check, 1):
        
        # Build status message with progress bar
        progress_bar = get_progress_bar(i, total_files)
        status_msg = f"{progress_bar} {i}/{total_files} (Renamed: {files_renamed})"
        sys.stdout.write(status_msg.ljust(70) + "\r")
        sys.stdout.flush()
        
        # Check if filename contains any of the wrong characters
        new_filename = filename
        for wrong_char, correct_char in char_mapping.items():
            if wrong_char in new_filename:
                new_filename = new_filename.replace(wrong_char, correct_char)
        
        # If filename needs to be changed, rename it
        if new_filename != filename:
            old_path = root / filename
            new_path = root / new_filename
            
            try:
                # Check if new filename already exists (Silent Skip)
                if new_path.exists():
                    conflict_skipped += 1
                    continue
                
                # Rename the file
                old_path.rename(new_path)
                files_renamed += 1
                
            except Exception as e:
                error_count += 1
                print(f"\nError renaming '{filename}': {e}")
                sys.stdout.write(status_msg.ljust(70) + "\r")
                sys.stdout.flush()

    # Clear status line and print final summary
    sys.stdout.write(" " * 70 + "\r")
    sys.stdout.flush()
    
    print("=" * 50)
    print("Character Fix Complete:")
    print(f"  Total Files Scanned:   {total_files}")
    print(f"  Files Renamed:         {files_renamed}")
    
    if conflict_skipped > 0:
        print(f"  Skipped (Conflict):    {conflict_skipped}")
    
    if error_count > 0:
        print(f"  Errors:                 {error_count} (Check warnings above)")
    
    print("=" * 50)

if __name__ == "__main__":
    rename_files()