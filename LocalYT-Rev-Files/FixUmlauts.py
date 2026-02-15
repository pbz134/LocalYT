import os
from pathlib import Path

def preview_changes():
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
        'channelbanner',
        'channelpic',
        'descriptions',
        'filedates',
        'filenames',
        'subcount',
        'thumbnails',
        'videolengths',
        'videos',
        'videostats',
        'viewcounts'
    ]
    
    # Get the directory where the script is located
    script_dir = Path(__file__).resolve().parent
    # Go up one level from the script directory (LocalYT-Rev-Files) to reach the parent
    base_dir = script_dir.parent
    
    print("PREVIEW MODE - No files will be changed")
    print(f"Scanning from parent directory: {base_dir}")
    print("Character mapping:")
    for wrong, correct in char_mapping.items():
        print(f"  '{wrong}' → '{correct}'")
    print()
    
    # Counters for statistics
    files_to_rename = 0
    files_scanned = 0
    
    # Process each folder
    for folder_name in folders_to_scan:
        folder_path = base_dir / folder_name
        
        if not folder_path.exists():
            print(f"Warning: Folder '{folder_name}' does not exist, skipping...")
            continue
        
        print(f"Scanning folder: {folder_name}")
        
        # Recursively walk through the folder
        for root, dirs, files in os.walk(folder_path):
            for filename in files:
                files_scanned += 1
                
                # Check if filename contains any of the wrong characters
                new_filename = filename
                for wrong_char, correct_char in char_mapping.items():
                    if wrong_char in new_filename:
                        new_filename = new_filename.replace(wrong_char, correct_char)
                
                # If filename would be changed, show it
                if new_filename != filename:
                    print(f"  Would rename: '{filename}' → '{new_filename}'")
                    files_to_rename += 1
    
    # Print summary
    print(f"\n{'='*50}")
    print(f"Summary:")
    print(f"  Files scanned: {files_scanned}")
    print(f"  Files that would be renamed: {files_to_rename}")
    print(f"{'='*50}")
    
    if files_to_rename > 0:
        print("\nTo actually rename the files, run the script again with '--apply'")
    else:
        print("\nNo files need to be renamed.")

def apply_changes():
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
        'channelbanner',
        'channelpic',
        'descriptions',
        'filedates',
        'filenames',
        'subcount',
        'thumbnails',
        'videolengths',
        'videos',
        'videostats',
        'viewcounts'
    ]
    
    # Get the directory where the script is located
    script_dir = Path(__file__).resolve().parent
    # Go up one level from the script directory (LocalYT-Rev-Files) to reach the parent
    base_dir = script_dir.parent
    
    print("APPLYING CHANGES - Files will be renamed")
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
            print(f"Warning: Folder '{folder_name}' does not exist, skipping...")
            continue
        
        print(f"Scanning folder: {folder_name}")
        
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
                        # Check if new filename already exists
                        if new_path.exists():
                            print(f"  Warning: '{new_filename}' already exists, skipping rename of '{filename}'")
                            continue
                        
                        # Rename the file
                        old_path.rename(new_path)
                        print(f"  Renamed: '{filename}' → '{new_filename}'")
                        files_renamed += 1
                        
                    except Exception as e:
                        print(f"  Error renaming '{filename}': {e}")
    
    # Print summary
    print(f"\n{'='*50}")
    print(f"Summary:")
    print(f"  Files scanned: {files_scanned}")
    print(f"  Files renamed: {files_renamed}")
    print(f"{'='*50}")

def main():
    import sys
    
    print("YouTube Metadata Filename Character Fixer")
    print("=" * 50)
    
    # Check command line arguments
    if len(sys.argv) > 1 and sys.argv[1] == '--apply':
        print("Running in APPLY mode - files will be renamed")
        print()
        apply_changes()
    else:
        print("Running in PREVIEW mode (default) - no files will be changed")
        print("Use '--apply' argument to rename files")
        print()
        preview_changes()

if __name__ == "__main__":
    main()