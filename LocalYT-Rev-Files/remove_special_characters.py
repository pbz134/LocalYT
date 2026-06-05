#!/usr/bin/env python3
"""
Simple Filename Cleaner for LocalYT Video Library
"""

import os
import re
import shutil
from pathlib import Path

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
    
    # Replace triple spaces with " - " (common separator pattern)
    filename = re.sub(r'\s{3,}', ' - ', filename)
    
    # Clean up any remaining double spaces
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
        'filedates',
        'descriptions',
        'videostats',
        'subtitles'
    ]
    
    total_renamed = 0
    
    for dir_name in dirs_to_process:
        dir_path = root_dir / dir_name
        
        if not dir_path.exists():
            continue
        
        # Process all files
        for item in dir_path.rglob('*'):
            if item.is_file() and not item.name.startswith('.'):
                original_stem = item.stem
                extension = item.suffix
                
                cleaned_stem = clean_filename(original_stem, remove_chars, space_chars)
                
                if cleaned_stem != original_stem:
                    new_path = item.parent / f"{cleaned_stem}{extension}"
                    
                    if not new_path.exists():
                        shutil.move(str(item), str(new_path))
                        print(f"Renamed: {original_stem}{extension} -> {cleaned_stem}{extension}")
                        total_renamed += 1
                    else:
                        print(f"Skipped (exists): {new_path.name}")
    
    print(f"\nTotal files renamed: {total_renamed}")

if __name__ == "__main__":
    clean_all_files()