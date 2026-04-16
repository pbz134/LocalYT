import os
import re
from pathlib import Path

def check_and_create_subcount_files(videos_dir, subcount_dir):
    """
    Analyze folders in /videos and ensure corresponding .txt files exist in /subcount.
    Creates missing files with default content "10,000".
    """
    
    # Check if videos directory exists
    if not os.path.exists(videos_dir):
        print(f"Error: Videos directory not found at {videos_dir}")
        return

    # Ensure the subcount directory exists
    os.makedirs(subcount_dir, exist_ok=True)
    
    # Get all folders in the videos directory
    try:
        channel_folders = [
            d for d in os.listdir(videos_dir) 
            if os.path.isdir(os.path.join(videos_dir, d))
        ]
    except FileNotFoundError:
        print("Error: No channel folders found.")
        return
    
    channel_count = len(channel_folders)
    
    if channel_count == 0:
        print("No channel folders found.")
        return
    
    # Track results
    existing_count = 0
    created_files = []
    
    # Check each channel folder
    for channel in channel_folders:
        txt_filename = f"{channel}.txt"
        txt_file_path = os.path.join(subcount_dir, txt_filename)
        
        if os.path.exists(txt_file_path):
            existing_count += 1
        else:
            # File doesn't exist, create it with default content
            default_content = "10,000"
            try:
                with open(txt_file_path, 'w', encoding='utf-8') as f:
                    f.write(default_content)
                created_files.append(channel)
            except Exception as e:
                print(f"Error creating file for {channel}: {e}")

    # Print Summary
    print(f"Processed {channel_count} channels: {existing_count} existing, {len(created_files)} new files created.")

def validate_subcount_format(subcount_dir):
    """
    Optional: Validate that all subcount files contain properly formatted numbers.
    """
    if not os.path.exists(subcount_dir):
        return
    
    try:
        subcount_files = [
            f for f in os.listdir(subcount_dir) 
            if f.endswith('.txt') and os.path.isfile(os.path.join(subcount_dir, f))
        ]
    except FileNotFoundError:
        return
    
    if not subcount_files:
        return
        
    invalid_files = []
    
    for filename in subcount_files:
        filepath = os.path.join(subcount_dir, filename)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read().strip()
            
            clean_content = content.replace(',', '')
            
            if not clean_content.isdigit():
                invalid_files.append((filename, content))
                
        except Exception:
            invalid_files.append((filename, "Read Error"))
    
    if invalid_files:
        print(f"Warning: {len(invalid_files)} files have invalid formats:")
        for filename, content in invalid_files:
            print(f"  - {filename}: '{content}'")

if __name__ == '__main__':
    # --- DYNAMIC PATH RESOLUTION ---
    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent
    
    videos_directory = root_dir / "videos"
    subcount_directory = root_dir / "subcount"
    # -------------------------------

    check_and_create_subcount_files(videos_directory, subcount_directory)
    validate_subcount_format(subcount_directory)
    
    print("Done!")