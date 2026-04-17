import os
from pathlib import Path

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
    print(f"Scanning from parent directory: {base_dir}")
    print("Character mapping:")
    for wrong, correct in char_mapping.items():
        print(f"  '{wrong}' → '{correct}'")
    print()
    
    # Counters for statistics
    files_renamed = 0
    files_scanned = 0
    
    # Process each folder
    for folder_name in folders_to_scan:
        folder_path = base_dir / folder_name
        
        if not folder_path.exists():
            # Silently skip missing folders or print a single header warning if preferred. 
            # Keeping it silent to match "no skipped files output" request.
            continue
        
        # Recursively walk through the folder
        for root, dirs, files in os.walk(folder_path):
            for filename in files:
                files_scanned += 1
                
                # Check if filename contains any of the wrong characters
                new_filename = filename
                for wrong_char, correct_char in char_mapping.items():
                    if wrong_char in new_filename:
                        new_filename = new_filename.replace(wrong_char, correct_char)
                
                # If filename needs to be changed, rename it
                if new_filename != filename:
                    old_path = Path(root) / filename
                    new_path = Path(root) / new_filename
                    
                    try:
                        # Check if new filename already exists (Silent Skip)
                        if new_path.exists():
                            continue
                        
                        # Rename the file
                        old_path.rename(new_path)
                        files_renamed += 1
                        
                    except Exception as e:
                        # Optional: Print only hard errors if desired, 
                        # but keeping it silent matches the pattern.
                        pass
    
    # Print summary
    print(f"{'='*50}")
    print(f"Summary:")
    print(f"  Files scanned: {files_scanned}")
    print(f"  Files renamed: {files_renamed}")
    print(f"{'='*50}")

if __name__ == "__main__":
    rename_files()