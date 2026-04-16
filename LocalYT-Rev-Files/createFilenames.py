import os
import shutil
import sys
from pathlib import Path

def create_filename_files(videos_dir, filenames_dir):
    """
    Recursively scans /videos and its subdirectories,
    and creates .txt files with the same name as each video/audio file.
    Skips creating files if they already exist.
    """
    
    # Check if videos directory exists
    if not os.path.exists(videos_dir):
        print(f"Error: Videos directory not found at {videos_dir}")
        return
    
    # Ensure the filenames directory exists
    os.makedirs(filenames_dir, exist_ok=True)
    
    # Count files first for progress display
    files_to_process = []
    for root, _, files in os.walk(videos_dir):
        for filename in files:
            if filename.endswith(('.mp4', '.mkv', '.mp3')):
                files_to_process.append((root, filename))
    
    total_files = len(files_to_process)
    
    if total_files == 0:
        print("No video/audio files found.")
        return

    print(f"Scanning {total_files} files...", end="\r")
    
    # Process files
    processed_count = 0
    created_count = 0
    skipped_count = 0
    error_count = 0
    
    for i, (root, filename) in enumerate(files_to_process, 1):
        
        # Update live counter
        status_msg = f"Processing file #{i}/{total_files}... (Created: {created_count})"
        sys.stdout.write(status_msg.ljust(60) + "\r")
        sys.stdout.flush()
        
        file_path = os.path.join(root, filename)
        
        try:
            # Get the base name without extension
            base_name = os.path.splitext(filename)[0]
            
            # Calculate relative path from videos_dir to current file's directory
            relative_dir = os.path.relpath(root, videos_dir)
            
            # Create corresponding output directory
            output_dir = os.path.join(filenames_dir, relative_dir)
            os.makedirs(output_dir, exist_ok=True)
            
            # Create output file path (.txt file with same name)
            output_file_path = os.path.join(output_dir, f"{base_name}.txt")
            
            # Check if file already exists
            if os.path.exists(output_file_path):
                skipped_count += 1
                continue
            
            # Write the filename (without extension) to the txt file
            with open(output_file_path, 'w', encoding='utf-8') as txt_file:
                txt_file.write(base_name)
            
            created_count += 1
            
        except Exception as e:
            print(f"\nError processing {filename}: {e}")
            error_count += 1

    # Clear the status line and print final summary
    sys.stdout.write(" " * 60 + "\r") 
    sys.stdout.flush()
    
    print(f"Filenames Update Complete:")
    print(f"  Total Files Scanned: {total_files}")
    print(f"  New Files Created:   {created_count}")
    print(f"  Skipped (Exist):     {skipped_count}")
    
    if error_count > 0:
        print(f"  Errors:              {error_count}")

if __name__ == '__main__':
    # --- DYNAMIC PATH RESOLUTION ---
    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent
    
    videos_dir = root_dir / "videos"
    filenames_dir = root_dir / "filenames"
    # -------------------------------
    
    create_filename_files(videos_dir, filenames_dir)