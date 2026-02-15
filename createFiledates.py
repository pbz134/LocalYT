import os
import datetime

def get_file_last_modified_date(file_path):
    """Get the last modified date of a file."""
    return os.path.getmtime(file_path)

def create_filedates(videos_dir, filedates_dir):
    # Ensure the filedates directory exists
    if not os.path.exists(filedates_dir):
        os.makedirs(filedates_dir)

    # Recursively scan all .mp4, .mkv and .mp3 files in the videos directory
    for root, _, files in os.walk(videos_dir):
        for filename in files:
            if filename.endswith(('.mp4', '.mkv', '.mp3')):
                file_path = os.path.join(root, filename)
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
                    with open(txt_file_path, 'w') as txt_file:
                        txt_file.write(last_modified_date_str)

if __name__ == '__main__':
    videos_dir = './videos'
    filedates_dir = './filedates'
    create_filedates(videos_dir, filedates_dir)