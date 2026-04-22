import os
import sys
import time
from pathlib import Path
from PIL import Image
import multiprocessing

# --- CONFIGURATION ---
TARGET_WIDTH = 300
# Only scan .jpg as requested
SUPPORTED_EXTENSIONS = ('.jpg', '.jpeg') 
# Use all available CPU cores minus 1 (to keep system responsive)
NUM_WORKERS = max(1, multiprocessing.cpu_count() - 1)
# ---------------------

def process_single_image(args):
    """
    Worker function: Processes a single image tuple.
    Runs in a separate process.
    """
    src_full_path, rel_path, output_dir = args
    
    try:
        dest_full_path = os.path.join(output_dir, rel_path)
        
        # Skip if file already exists
        if os.path.exists(dest_full_path):
            return 'skip'

        # Create subdirectories if needed
        dest_subdir = os.path.dirname(dest_full_path)
        if not os.path.exists(dest_subdir):
            try:
                os.makedirs(dest_subdir)
            except FileExistsError:
                pass # Handle race condition where dir is created between check and makedirs

        # Open, Resize, Save
        with Image.open(src_full_path) as img:
            width, height = img.size
            
            if width > TARGET_WIDTH:
                ratio = height / width
                new_height = int(TARGET_WIDTH * ratio)
                # Use BOX filter: faster for downscaling, good enough for thumbnails
                img = img.resize((TARGET_WIDTH, new_height), Image.Resampling.BOX)
            
            # Save optimized JPEG to reduce disk write time
            img.save(dest_full_path, 'JPEG', quality=85, optimize=True)
            
        return 'success'

    except Exception as e:
        return f'Error: {rel_path} - {str(e)}'

def run_multiprocessing_pool(thumbnails_dir, output_dir, files_to_process):
    
    created_count = 0
    skipped_count = 0
    error_count = 0
    total_files = len(files_to_process)
    
    # Prepare arguments for pool (src, relpath, output_dir)
    tasks = [(f[0], f[1], output_dir) for f in files_to_process]
    
    print(f"Starting processing using {NUM_WORKERS} workers...")
    start_time = time.time()

    # Use Pool.imap_unordered for maximum throughput (processes results as they finish)
    with multiprocessing.Pool(processes=NUM_WORKERS) as pool:
        for i, result in enumerate(pool.imap_unordered(process_single_image, tasks), 1):
            
            # Update Status Line
            status_msg = f"Processing file #{i}/{total_files}... (New: {created_count}) [Speed: Multi-Core]"
            sys.stdout.write(status_msg.ljust(75) + "\r")
            sys.stdout.flush()

            if result == 'success':
                created_count += 1
            elif result == 'skip':
                skipped_count += 1
            else:
                # It was an error string
                print(f"\n{result}")
                error_count += 1

    end_time = time.time()
    duration = end_time - start_time
    
    # Final Summary
    sys.stdout.write(" " * 75 + "\r") 
    sys.stdout.flush()
    
    print(f"Thumbnails-Small Update Complete:")
    print(f"  Total Files Scanned:  {total_files}")
    print(f"  New Small Created:    {created_count}")
    print(f"  Skipped (Exist):      {skipped_count}")
    if error_count > 0:
        print(f"  Errors:               {error_count}")
    print(f"  Time Taken:           {duration:.2f}s")

def main():
    # --- DYNAMIC PATH RESOLUTION ---
    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent
    
    thumbnails_dir = root_dir / "thumbnails"
    output_dir = root_dir / "thumbnails-small"
    # -------------------------------
    
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    if not os.path.exists(thumbnails_dir):
        print(f"Error: Thumbnails directory not found at {thumbnails_dir}")
        return

    # 1. Fast Scan Phase (Single Threaded I/O is usually fine for listing)
    print("Scanning for .jpg files...", end="\r")
    files_to_process = []
    
    for root, _, files in os.walk(thumbnails_dir):
        for filename in files:
            if filename.lower().endswith(SUPPORTED_EXTENSIONS):
                full_path = os.path.join(root, filename)
                rel_path = os.path.relpath(full_path, thumbnails_dir)
                files_to_process.append((full_path, rel_path))

    total_files = len(files_to_process)
    
    if total_files == 0:
        print("No .jpg files found.")
        return

    print(f"Found {total_files} files. Starting generation...")
    
    # 2. Processing Phase (Multi-Process)
    run_multiprocessing_pool(thumbnails_dir, output_dir, files_to_process)

if __name__ == "__main__":
    # Required for Windows/multiprocessing safety
    main()