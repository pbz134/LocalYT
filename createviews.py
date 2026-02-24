import os
import random
import sys
import hashlib

def generate_view_count(video_name, subscriber_count):
    # Introduce additional randomness by varying the percentage of subscribers that contribute to the view count
    random_factor = random.uniform(0.10, 0.78)  # Random factor between 10% and 78%
    views = int(subscriber_count * random_factor) + random.randint(-int(subscriber_count * 0.03), int(subscriber_count * 0.03))
    return "{:,}".format(views)  # Format the views with commas as thousand separators

def safe_makedirs(path):
    """Safely create directories, handling long paths and special characters"""
    try:
        # For Windows, handle long paths by using the extended-length path syntax
        if sys.platform == 'win32' and len(path) > 260:
            # Convert to extended-length path format
            if not path.startswith('\\\\?\\'):
                path = '\\\\?\\' + os.path.abspath(path)
        
        os.makedirs(path, exist_ok=True)
        return True
    except Exception as e:
        print(f"Warning: Could not create directory {path}: {e}")
        return False

def scan_videos_directory(videos_dir, viewcounts_dir, subcount_dir, skip_existing=True):
    """
    Scan videos directory and create view count files.
    
    Args:
        videos_dir: Directory containing videos
        viewcounts_dir: Directory to store view count files
        subcount_dir: Directory containing subscriber count files
        skip_existing: If True, skip files that already exist. If False, overwrite them.
    """
    # Ensure the viewcounts directory exists
    if not os.path.exists(viewcounts_dir):
        os.makedirs(viewcounts_dir)

    # Counters for reporting
    total_files = 0
    created_files = 0
    skipped_files = 0
    error_files = 0

    # Recursively scan all .mp4, .mkv and .mp3 files in the videos directory
    for root, _, files in os.walk(videos_dir):
        for filename in files:
            if filename.endswith(('.mp4', '.mkv', '.mp3')):
                total_files += 1
                video_name = os.path.splitext(filename)[0]
                
                # Get the channel name (top-level folder under videos_dir)
                relative_path = os.path.relpath(root, videos_dir)
                path_parts = relative_path.split(os.sep)
                channel_name = path_parts[0]  # First part is the channel name

                # Read the subscriber count for the channel
                subcount_file_path = os.path.join(subcount_dir, f"{channel_name}.txt")
                if not os.path.exists(subcount_file_path):
                    print(f"Subscriber count file not found for channel: {channel_name}")
                    error_files += 1
                    continue

                try:
                    with open(subcount_file_path, 'r', encoding='utf-8') as subcount_file:
                        subscriber_count_str = subcount_file.read().strip().replace(',', '')
                        subscriber_count = int(subscriber_count_str)
                except Exception as e:
                    print(f"Error reading subscriber count for {channel_name}: {e}")
                    error_files += 1
                    continue

                # Create corresponding subdirectories in the viewcounts directory
                relative_path = os.path.relpath(root, videos_dir)
                viewcounts_subdir = os.path.join(viewcounts_dir, relative_path)
                
                # Try to create the subdirectory
                if not safe_makedirs(viewcounts_subdir):
                    # If directory creation fails, try to create a simplified path
                    # Replace problematic characters in folder names
                    simplified_relative = ''.join(c for c in relative_path if c.isalnum() or c in ' _-')
                    viewcounts_subdir = os.path.join(viewcounts_dir, simplified_relative)
                    safe_makedirs(viewcounts_subdir)

                # Sanitize the filename - remove or replace characters that might cause issues
                safe_video_name = video_name
                # Replace any characters that are problematic in Windows filenames
                for char in ['<', '>', ':', '"', '/', '\\', '|', '?', '*']:
                    safe_video_name = safe_video_name.replace(char, '_')
                
                txt_filename = f"{safe_video_name}.txt"
                txt_file_path = os.path.join(viewcounts_subdir, txt_filename)
                
                # Handle long paths
                original_path = txt_file_path
                if sys.platform == 'win32' and len(txt_file_path) > 260:
                    # Create a hash of the original name to keep it unique but shorter
                    name_hash = hashlib.md5(video_name.encode('utf-8')).hexdigest()[:8]
                    txt_filename = f"{name_hash}.txt"
                    txt_file_path = os.path.join(viewcounts_subdir, txt_filename)
                    
                # Check if file already exists
                if skip_existing and os.path.exists(txt_file_path):
                    print(f"Skipping existing: {txt_file_path}")
                    skipped_files += 1
                    continue

                try:
                    # Write the view counts to a text file
                    view_count = generate_view_count(video_name, subscriber_count)
                    with open(txt_file_path, 'w', encoding='utf-8') as txt_file:
                        txt_file.write(view_count)
                    print(f"Created: {txt_file_path} -> {view_count} views")
                    created_files += 1
                except Exception as e:
                    print(f"Error writing to {txt_file_path}: {e}")
                    error_files += 1

    # Print summary
    print("\n" + "="*50)
    print(f"SCAN COMPLETE:")
    print(f"Total videos found: {total_files}")
    print(f"View count files created: {created_files}")
    print(f"Files skipped (already exist): {skipped_files}")
    print(f"Errors encountered: {error_files}")
    print("="*50)

if __name__ == "__main__":
    videos_dir = './videos'
    viewcounts_dir = './viewcounts'
    subcount_dir = './subcount'
    
    print(f"Starting scan...")
    print(f"Videos directory: {os.path.abspath(videos_dir)}")
    print(f"Viewcounts directory: {os.path.abspath(viewcounts_dir)}")
    print(f"Subcount directory: {os.path.abspath(subcount_dir)}")
    print("\nOptions:")
    print("  - Skip existing files: YES (use --overwrite to replace existing files)")
    
    # Check command line arguments for overwrite option
    import argparse
    parser = argparse.ArgumentParser(description='Generate view counts for videos')
    parser.add_argument('--overwrite', action='store_true', 
                       help='Overwrite existing view count files')
    args = parser.parse_args()
    
    skip_existing = not args.overwrite
    
    scan_videos_directory(videos_dir, viewcounts_dir, subcount_dir, skip_existing=skip_existing)