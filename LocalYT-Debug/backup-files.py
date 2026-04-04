import os
import shutil
import zipfile
from datetime import datetime

# Define the files to back up
FILES_TO_BACKUP = [
    "login_attempts.json",
    "shortlinks.json",
    "subscriptions.json",
    "user-playlists.json",
    "userPreferences.json",
    "users.json",
    "watchHistory.json",
    "likes.json"
]

# Define the directories to back up
DIRS_TO_BACKUP = [
    "temp-uploads",
    "sessions",
    "user-profiles"
]

# Define metadata file extensions to scan for
METADATA_EXTENSIONS = {'.png', '.txt', '.jpg', '.json'}

# Directory names to exclude from scanning (at any level)
EXCLUDED_DIRS = {'node_modules', 'venv'}


def get_script_and_root_paths():
    """Get the script directory and server root (parent directory)."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    server_root = os.path.dirname(script_dir)
    return script_dir, server_root


def get_output_directory():
    """Ask user for an output directory path, create if needed."""
    while True:
        dest_path = input("\nEnter the full path where you want to save the backup: ").strip()
        dest_path = dest_path.rstrip(os.sep)
        
        if not dest_path:
            print("Error: Path cannot be empty. Please try again.")
            continue
            
        if not os.path.exists(dest_path):
            create = input(f"The directory '{dest_path}' does not exist. Create it? (y/n): ").strip().lower()
            if create == 'y':
                try:
                    os.makedirs(dest_path)
                    print(f"Directory created: {dest_path}")
                    return dest_path
                except OSError as e:
                    print(f"Error: Failed to create directory. {e}")
                    print("Please try a different path.")
            else:
                print("Please provide a valid path.")
        else:
            if os.path.isdir(dest_path):
                return dest_path
            else:
                print(f"Error: '{dest_path}' exists but is a file, not a directory. Please try again.")


def get_input_file():
    """Ask user for an input zip file path."""
    while True:
        file_path = input("\nEnter the full path to the backup ZIP file: ").strip()
        
        if not file_path:
            print("Error: Path cannot be empty. Please try again.")
            continue
            
        if not os.path.exists(file_path):
            print(f"Error: File '{file_path}' does not exist. Please try again.")
            continue
            
        if not os.path.isfile(file_path):
            print(f"Error: '{file_path}' is not a file. Please try again.")
            continue
            
        if not file_path.lower().endswith('.zip'):
            print("Warning: File does not have .zip extension. Proceeding anyway...")
            
        return file_path


def backup_user_files(server_root, dest_path):
    """Backup specific user data files and directories."""
    print("\nStarting User Files Backup...")
    success_count = 0
    skip_count = 0

    # --- Backup Files ---
    for filename in FILES_TO_BACKUP:
        source_file = os.path.join(server_root, filename)
        dest_file = os.path.join(dest_path, filename)
        
        if os.path.exists(source_file):
            try:
                shutil.copy2(source_file, dest_file)
                print(f"[OK] Backed up file: {filename}")
                success_count += 1
            except Exception as e:
                print(f"[FAIL] Error copying {filename}: {e}")
        else:
            print(f"[SKIP] File not found at root: {filename}")
            skip_count += 1

    # --- Backup Directories ---
    for dirname in DIRS_TO_BACKUP:
        source_dir = os.path.join(server_root, dirname)
        dest_dir = os.path.join(dest_path, dirname)
        
        if os.path.exists(source_dir):
            try:
                shutil.copytree(source_dir, dest_dir, dirs_exist_ok=True)
                print(f"[OK] Backed up folder: {dirname}/")
                success_count += 1
            except Exception as e:
                print(f"[FAIL] Error copying folder {dirname}: {e}")
        else:
            print(f"[SKIP] Folder not found at root: {dirname}/")
            skip_count += 1

    print(f"\n--- User Files Backup Complete ---")
    print(f"Successfully backed up: {success_count} item(s)")
    if skip_count > 0:
        print(f"Skipped (not found):   {skip_count} item(s)")


def backup_metadata_files(server_root, dest_path):
    """Recursively scan server root for metadata files and create a ZIP preserving folder structure.
    
    - Only includes files that are INSIDE subdirectories (no loose files at base level)
    - Excludes node_modules and venv directories (including Algorithm/venv)
    """
    # Normalize server root for reliable comparison (no trailing separator)
    server_root_norm = os.path.normpath(server_root)
    
    print(f"\nScanning for metadata files in: {server_root_norm}")
    print("Looking for: .png, .txt, .jpg, .json files (inside folders only)")
    print("Excluding: node_modules, venv folders")
    
    found_files = []
    skipped_root_files = []
    
    # Recursively walk through the server root directory
    for current_root, dirs, files in os.walk(server_root_norm):
        # Determine if we're at the root level using normalized paths
        is_root_level = (os.path.normpath(current_root) == server_root_norm)
        
        # Filter out excluded directories IN-PLACE to prevent descending into them
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]
        
        for filename in files:
            # Check if file has a metadata extension
            _, ext = os.path.splitext(filename)
            
            if ext.lower() in METADATA_EXTENSIONS:
                full_path = os.path.join(current_root, filename)
                
                # SKIP ALL files at root/base level (only include files inside subdirectories)
                if is_root_level:
                    skipped_root_files.append(filename)
                    continue
                
                # Get relative path from server root to preserve structure
                rel_path = os.path.relpath(full_path, server_root_norm)
                found_files.append((full_path, rel_path))
    
    # Report skipped root-level files
    if skipped_root_files:
        print(f"\n[INFO] Skipped {len(skipped_root_files)} base-level file(s):")
        for f in sorted(skipped_root_files):
            print(f"         - {f}")
    
    if not found_files:
        print("\n[WARN] No metadata files found inside subdirectories!")
        return
    
    print(f"\nFound {len(found_files)} metadata file(s) inside folders to archive.")
    
    # Create timestamped zip filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_filename = f"metadata_backup_{timestamp}.zip"
    zip_filepath = os.path.join(dest_path, zip_filename)
    
    try:
        with zipfile.ZipFile(zip_filepath, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for full_path, rel_path in found_files:
                # Write file to zip with relative path to preserve folder structure
                zipf.write(full_path, rel_path)
                print(f"[OK] Added: {rel_path}")
                
        print(f"\n--- Metadata Backup Complete ---")
        print(f"Created ZIP archive: {zip_filepath}")
        print(f"Total files archived: {len(found_files)}")
        
    except Exception as e:
        print(f"\n[FAIL] Error creating ZIP archive: {e}")


def reapply_backup_zip(server_root, zip_filepath):
    """Extract a backup ZIP file to the server root, preserving structure."""
    # Normalize server root
    server_root_norm = os.path.normpath(server_root)
    
    print(f"\nReapplying backup from: {zip_filepath}")
    print(f"Target directory: {server_root_norm}")
    
    # First, show what's in the zip
    try:
        with zipfile.ZipFile(zip_filepath, 'r') as zipf:
            file_list = zipf.namelist()
            print(f"\nZIP contains {len(file_list)} item(s):")
            
            # Show first few items as preview
            preview_count = min(10, len(file_list))
            for i in range(preview_count):
                print(f"  - {file_list[i]}")
            if len(file_list) > preview_count:
                print(f"  ... and {len(file_list) - preview_count} more item(s)")
            
            confirm = input(f"\nExtract {len(file_list)} item(s) to {server_root_norm}? (y/n): ").strip().lower()
            
            if confirm != 'y':
                print("Operation cancelled by user.")
                return
            
            print("\nExtracting...")
            success_count = 0
            error_count = 0
            
            for item in file_list:
                try:
                    # Extract to server root, preserving structure
                    zipf.extract(item, server_root_norm)
                    success_count += 1
                except Exception as e:
                    print(f"[FAIL] Error extracting {item}: {e}")
                    error_count += 1
            
            print(f"\n--- Restore Complete ---")
            print(f"Successfully extracted: {success_count} item(s)")
            if error_count > 0:
                print(f"Errors:                 {error_count} item(s)")
                
    except zipfile.BadZipFile:
        print("[FAIL] Error: Invalid or corrupted ZIP file.")
    except Exception as e:
        print(f"[FAIL] Error reading ZIP file: {e}")


def main():
    script_dir, server_root = get_script_and_root_paths()
    
    print("=" * 50)
    print("   LocalYT Backup & Restore Tool")
    print("=" * 50)
    print(f"\nScript location : {script_dir}")
    print(f"Server root     : {server_root}")
    
    # Main menu
    print("\n" + "-" * 50)
    print("Select an option:")
    print("  1. Back up User Files (JSON data + folders)")
    print("  2. Back up Metadata Files (.png/.txt/.jpg/.json -> ZIP)")
    print("  3. Reapply/Restore from a backup ZIP")
    print("  0. Exit")
    print("-" * 50)
    
    while True:
        choice = input("\nEnter your choice (0-3): ").strip()
        
        if choice == '0':
            print("Goodbye!")
            break
            
        elif choice == '1':
            # Backup user files - ask for output directory first
            dest_path = get_output_directory()
            backup_user_files(server_root, dest_path)
            break
            
        elif choice == '2':
            # Backup metadata files - ask for output directory first
            dest_path = get_output_directory()
            backup_metadata_files(server_root, dest_path)
            break
            
        elif choice == '3':
            # Reapply backup - ask for input zip file first
            zip_filepath = get_input_file()
            reapply_backup_zip(server_root, zip_filepath)
            break
            
        else:
            print("Invalid choice. Please enter 0, 1, 2, or 3.")


if __name__ == "__main__":
    main()