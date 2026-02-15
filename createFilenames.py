import os
import shutil

def create_filename_files(videos_dir, filenames_dir):
    """
    Recursively scans /videos and its subdirectories,
    and creates .txt files with the same name as each video/audio file.
    """
    
    # Check if videos directory exists
    if not os.path.exists(videos_dir):
        print(f"ERROR: Videos directory not found: {videos_dir}")
        return
    
    # Ensure the filenames directory exists
    os.makedirs(filenames_dir, exist_ok=True)
    
    print(f"Source directory: {videos_dir}")
    print(f"Output directory: {filenames_dir}")
    print("Scanning for files...")
    
    # Count files first for progress display
    files_to_process = []
    for root, _, files in os.walk(videos_dir):
        for filename in files:
            if filename.endswith(('.mp4', '.mkv', '.mp3')):
                files_to_process.append((root, filename))
    
    file_count = len(files_to_process)
    
    if file_count == 0:
        print(f"No video/audio files found in {videos_dir}")
        return
    
    print(f"Found {file_count} files to process")
    print("Creating filename files...")
    
    # Process files
    processed = 0
    successful = 0
    
    for i, (root, filename) in enumerate(files_to_process, 1):
        file_path = os.path.join(root, filename)
        
        # Show progress
        progress = f"[{i}/{file_count}]"
        
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
            
            # Write the filename (without extension) to the txt file
            with open(output_file_path, 'w', encoding='utf-8') as txt_file:
                txt_file.write(base_name)
            
            # Show single-line result
            print(f"{progress} ✓ Created: {relative_dir}/{base_name}.txt")
            
            successful += 1
            
        except Exception as e:
            print(f"{progress} ✗ Failed to create file for {filename}: {str(e)}")
        
        processed += 1
    
    # Summary
    print(f"\n--- Summary ---")
    print(f"Successfully created: {successful}/{processed} filename files")
    print(f"Output directory: {filenames_dir}")
    
    # Show example structure if files were created
    if successful > 0:
        print("\nExample structure created:")
        print(f"{filenames_dir}/")
        print("├── video1.txt")
        print("├── subfolder/")
        print("│   └── video2.txt")
        print("└── subfolder/subsubfolder/")
        print("    └── video3.txt")

def copy_structure_only(videos_dir, filenames_dir):
    """
    Optional: Copy only the directory structure without files.
    Useful if you want to see the empty directory structure first.
    """
    print(f"\nCopying directory structure from {videos_dir} to {filenames_dir}...")
    
    # Remove existing filenames directory if it exists
    if os.path.exists(filenames_dir):
        shutil.rmtree(filenames_dir)
    
    # Walk through videos directory and create empty directories
    for root, dirs, files in os.walk(videos_dir):
        # Calculate relative path
        relative_path = os.path.relpath(root, videos_dir)
        
        # Create corresponding directory in filenames
        if relative_path == '.':
            target_dir = filenames_dir
        else:
            target_dir = os.path.join(filenames_dir, relative_path)
        
        os.makedirs(target_dir, exist_ok=True)
    
    print(f"Directory structure copied to {filenames_dir}")

if __name__ == '__main__':
    videos_dir = './videos'
    filenames_dir = './filenames'
    
    # Optional: Uncomment to see directory structure first
    # copy_structure_only(videos_dir, filenames_dir)
    
    # Create filename files
    create_filename_files(videos_dir, filenames_dir)