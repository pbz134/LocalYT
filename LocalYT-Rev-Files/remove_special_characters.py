#!/usr/bin/env python3
"""
Simple Filename Cleaner for LocalYT Video Library
"""

import os
import re
import shutil
import sys
from pathlib import Path

def get_progress_bar(current, total, width=20):
    """Generate a simple progress bar string."""
    if total == 0:
        return "[" + " " * width + "]"
    
    filled = int((current / total) * width)
    bar = "=" * filled + " " * (width - filled)
    return f"[{bar}]"

def load_blacklist(filepath):
    """Load blacklist characters from a file."""
    if not os.path.exists(filepath):
        return []
    
    with open(filepath, 'r', encoding='utf-8') as f:
        chars = []
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                # Handle common escape sequences
                if line == '\\n':
                    chars.append('\n')
                elif line == '\\t':
                    chars.append('\t')
                elif line == '\\r':
                    chars.append('\r')
                else:
                    chars.append(line)
        return chars

def clean_filename(filename, remove_chars, space_chars):
    """Clean a filename based on blacklists."""
    # Replace with space first
    for char in space_chars:
        filename = filename.replace(char, ' ')
    
    # Then remove characters
    for char in remove_chars:
        filename = filename.replace(char, '')
    
    # Clean up any multiple spaces (caused by removing separators) to a single space
    filename = re.sub(r'\s{2,}', ' ', filename).strip()
    
    return filename

def clean_all_files():
    """Main function to clean all filenames."""
    # Get directories
    script_dir = Path(__file__).parent
    root_dir = script_dir.parent
    
    # Load blacklists
    remove_chars = load_blacklist(script_dir / "replacebynone_blacklist.txt")
    space_chars = load_blacklist(script_dir / "replacebyspace_blacklist.txt")
    
    if not remove_chars and not space_chars:
        print("No blacklist characters found.")
        return
    
    # Define directories to process
    dirs_to_process = [
        'comments',
        'livechats',
        'videos',
        'videolengths', 
        'thumbnails',
        'thumbnails-small',
        'filedates',
        'descriptions',
        'videostats',
        'viewcounts',
        'videoresolutions',
        'filenames',
        'subtitles'
    ]
    
    # Pre-scan to count all files for progress
    sys.stdout.write("Scanning files...".ljust(70) + "\r")
    sys.stdout.flush()
    
    files_to_check = []
    for dir_name in dirs_to_process:
        dir_path = root_dir / dir_name
        
        if not dir_path.exists():
            continue
        
        for item in dir_path.rglob('*'):
            if item.is_file() and not item.name.startswith('.'):
                files_to_check.append(item)
    
    total_files = len(files_to_check)
    
    if total_files == 0:
        print("No files found to scan.                                    ")
        return
    
    print(f"LocalYT Filename Cleaner")
    print(f"Scanning: {total_files} files")
    print(f"Remove chars: {len(remove_chars)} | Space chars: {len(space_chars)}")
    
    # Stats tracking
    renamed_count = 0
    conflict_skipped = 0
    error_count = 0
    
    # Process each file
    for i, item in enumerate(files_to_check, 1):
        
        # Build status message with progress bar
        progress_bar = get_progress_bar(i, total_files)
        status_msg = f"{progress_bar} {i}/{total_files} (Cleaned: {renamed_count})"
        sys.stdout.write(status_msg.ljust(70) + "\r")
        sys.stdout.flush()
        
        original_stem = item.stem
        extension = item.suffix
        
        cleaned_stem = clean_filename(original_stem, remove_chars, space_chars)
        
        if cleaned_stem != original_stem:
            new_path = item.parent / f"{cleaned_stem}{extension}"
            
            if not new_path.exists():
                try:
                    shutil.move(str(item), str(new_path))
                    renamed_count += 1
                except Exception as e:
                    error_count += 1
                    print(f"\nError renaming '{original_stem}{extension}': {e}")
                    sys.stdout.write(status_msg.ljust(70) + "\r")
                    sys.stdout.flush()
            else:
                # Target already exists, likely a duplicate from a previous run.
                # Delete the source to clean up duplicates instead of skipping.
                try:
                    os.remove(str(item))
                    conflict_skipped += 1
                except Exception:
                    pass

    # Clear status line and print final summary
    sys.stdout.write(" " * 70 + "\r")
    sys.stdout.flush()
    
    print(f"Filename Cleaning Complete:")
    print(f"  Total Files Scanned:   {total_files}")
    print(f"  Files Cleaned:         {renamed_count}")
    
    if conflict_skipped > 0:
        print(f"  Skipped (Conflict):    {conflict_skipped}")
    
    if error_count > 0:
        print(f"  Errors:                 {error_count} (Check warnings above)")

if __name__ == "__main__":
    clean_all_files()