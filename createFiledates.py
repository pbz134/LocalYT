import os
import datetime
import sys

# Ensure UTF-8 encoding for stdout/stderr (helps with debugging)
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

def get_file_last_modified_date(file_path):
    """Get the last modified date of a file."""
    try:
        return os.path.getmtime(file_path)
    except FileNotFoundError as e:
        # Try to handle the path with proper encoding
        # Convert to bytes and back to handle any encoding issues
        try:
            # For Windows, try to use the raw filesystem encoding
            encoded_path = os.fsencode(file_path)
            decoded_path = os.fsdecode(encoded_path)
            return os.path.getmtime(decoded_path)
        except Exception as inner_e:
            print(f"Error accessing file: {file_path}")
            print(f"Encoded representation: {repr(file_path)}")
            raise e

def create_filedates(videos_dir, filedates_dir):
    # Ensure the filedates directory exists
    if not os.path.exists(filedates_dir):
        os.makedirs(filedates_dir)

    # Recursively scan all .mp4, .mkv and .mp3 files in the videos directory
    for root, _, files in os.walk(videos_dir):
        for filename in files:
            if filename.endswith(('.mp4', '.mkv', '.mp3')):
                # Use os.fsencode and os.fsdecode to handle Unicode filenames properly
                file_path = os.path.join(root, filename)
                
                # Try to normalize the path
                file_path = os.path.normpath(file_path)
                
                # Check if file exists before processing
                if not os.path.exists(file_path):
                    print(f"Warning: File does not exist (encoding issue?): {file_path}")
                    print(f"Filename repr: {repr(filename)}")
                    continue
                
                try:
                    last_modified_date = get_file_last_modified_date(file_path)
                    last_modified_date_str = datetime.datetime.fromtimestamp(last_modified_date).strftime('%d.%m.%Y')

                    # Create corresponding subdirectories in the filedates directory
                    relative_path = os.path.relpath(root, videos_dir)
                    filedates_subdir = os.path.join(filedates_dir, relative_path)
                    if not os.path.exists(filedates_subdir):
                        os.makedirs(filedates_subdir)

                    # Write the last modified date to a text file in the filedates directory
                    txt_filename = os.path.splitext(filename)[0] + '.txt'
                    txt_file_path = os.path.join(filedates_subdir, txt_filename)
                    
                    # Only write the file if it does not already exist
                    if not os.path.exists(txt_file_path):
                        # Use UTF-8 encoding for writing the text file
                        with open(txt_file_path, 'w', encoding='utf-8') as txt_file:
                            txt_file.write(last_modified_date_str)
                            print(f"Created: {txt_file_path}")
                            
                except Exception as e:
                    print(f"Error processing file: {file_path}")
                    print(f"Error: {e}")
                    continue

if __name__ == '__main__':
    # Use absolute paths to avoid any relative path issues
    videos_dir = os.path.abspath('./videos')
    filedates_dir = os.path.abspath('./filedates')
    
    print(f"Scanning directory: {videos_dir}")
    print(f"Output directory: {filedates_dir}")
    
    # Check if videos directory exists
    if not os.path.exists(videos_dir):
        print(f"Error: Videos directory '{videos_dir}' does not exist!")
        sys.exit(1)
    
    create_filedates(videos_dir, filedates_dir)
    print("Done!")