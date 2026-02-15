import os
import random

def generate_view_count(video_name, subscriber_count):
    # Introduce additional randomness by varying the percentage of subscribers that contribute to the view count
    random_factor = random.uniform(0.10, 0.78)  # Random factor between 10% and 78%
    views = int(subscriber_count * random_factor) + random.randint(-int(subscriber_count * 0.03), int(subscriber_count * 0.03))
    return "{:,}".format(views)  # Format the views with commas as thousand separators

def scan_videos_directory(videos_dir, viewcounts_dir, subcount_dir):
    # Ensure the viewcounts directory exists
    if not os.path.exists(viewcounts_dir):
        os.makedirs(viewcounts_dir)

    # Recursively scan all .mp4, .mkv and .mp3 files in the videos directory
    for root, _, files in os.walk(videos_dir):
        for filename in files:
            if filename.endswith(('.mp4', '.mkv', '.mp3')):
                video_name = os.path.splitext(filename)[0]
                channel_name = os.path.basename(root)

                # Read the subscriber count for the channel
                subcount_file_path = os.path.join(subcount_dir, f"{channel_name}.txt")
                if not os.path.exists(subcount_file_path):
                    print(f"Subscriber count file not found for channel: {channel_name}")
                    continue

                with open(subcount_file_path, 'r') as subcount_file:
                    subscriber_count_str = subcount_file.read().strip().replace(',', '')
                    subscriber_count = int(subscriber_count_str)

                # Create corresponding subdirectories in the viewcounts directory
                relative_path = os.path.relpath(root, videos_dir)
                viewcounts_subdir = os.path.join(viewcounts_dir, relative_path)
                if not os.path.exists(viewcounts_subdir):
                    os.makedirs(viewcounts_subdir)

                # Write the view counts to a text file in the viewcounts directory
                txt_filename = f"{video_name}.txt"
                txt_file_path = os.path.join(viewcounts_subdir, txt_filename)
                with open(txt_file_path, 'w') as txt_file:
                    txt_file.write(generate_view_count(video_name, subscriber_count))

if __name__ == "__main__":
    videos_dir = './videos'
    viewcounts_dir = './viewcounts'
    subcount_dir = './subcount'
    scan_videos_directory(videos_dir, viewcounts_dir, subcount_dir)
