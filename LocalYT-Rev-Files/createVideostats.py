import os
import random
import sys
import argparse
from pathlib import Path

# ---------------------------------------------------------------------------
# Like-rate tiers by view count.
# Real YouTube data (Voclify / CreatorDB): median like-to-view ratio is ~2.4%
# for 1K-10K views, ~2.0% for 10K-100K, ~1.7% for 100K-1M, and ~0.9% above 1M.
# Ranges below sit slightly above those medians so simulated content reads as
# "healthy engagement" without ever spiking to unrealistic values.
# ---------------------------------------------------------------------------
LIKE_RATE_TIERS = [
    # (upper_bound_exclusive, low_rate, high_rate)
    (10_000,       0.024, 0.042),
    (100_000,      0.019, 0.033),
    (1_000_000,    0.014, 0.026),
    (5_000_000,    0.009, 0.019),
    (20_000_000,   0.006, 0.013),
    (float('inf'), 0.004, 0.010),
]

# Dislike-to-like ratio. Real-world benchmarks: dislikes are typically
# 1%-3% of total votes, so as a fraction of likes that lands around
# 0.8%-2.8% for content that generally satisfies its audience.
DISLIKE_RATIO_LO = 0.008
DISLIKE_RATIO_HI = 0.028

# Fallback view-rate when no viewcount file exists yet.
# Matches createViews.py (10%-78% of subscribers + ±3% jitter) so the two
# scripts produce consistent numbers regardless of run order.
FALLBACK_VIEW_RATE_LO = 0.10
FALLBACK_VIEW_RATE_HI = 0.78
FALLBACK_JITTER_FRAC  = 0.03


def get_like_rate(view_count):
    """Return a realistic like-to-view ratio for the given view count."""
    for upper, lo, hi in LIKE_RATE_TIERS:
        if view_count < upper:
            mode = (lo + hi) / 2
            return random.triangular(lo, hi, mode)
    return 0.005  # unreachable, keeps type checker happy


def generate_like_dislike_counts(view_count):
    like_rate = get_like_rate(view_count)
    likes = max(1, int(view_count * like_rate))

    dislike_ratio = random.uniform(DISLIKE_RATIO_LO, DISLIKE_RATIO_HI)
    dislikes = max(0, int(likes * dislike_ratio))

    return f"{likes},{dislikes}"


def read_view_count(viewcounts_path):
    """Return (view_count, source). source is 'file', 'empty', 'error', or 'missing'."""
    if not os.path.exists(viewcounts_path):
        return None, 'missing'
    try:
        with open(viewcounts_path, 'r', encoding='utf-8') as f:
            raw = f.read().strip().replace(',', '')
        if not raw:
            return None, 'empty'
        return int(raw), 'file'
    except (ValueError, OSError):
        return None, 'error'


def estimate_view_count(subscriber_count):
    """Approximate what createViews.py would have written."""
    random_factor = random.uniform(FALLBACK_VIEW_RATE_LO, FALLBACK_VIEW_RATE_HI)
    jitter_range = int(subscriber_count * FALLBACK_JITTER_FRAC)
    jitter = random.randint(-jitter_range, jitter_range) if jitter_range > 0 else 0
    return max(1, int(subscriber_count * random_factor) + jitter)


def resolve_target_channel(target_channel, channels_in_videos):
    """
    Case-insensitive match of target_channel against the actual folder names.
    Returns the real folder name, or None if no match / not provided.
    """
    if target_channel is None:
        return None

    matched = [d for d in channels_in_videos if d.lower() == target_channel.lower()]

    if not matched:
        print(f"Error: Channel '{target_channel}' not found in videos directory.")
        if channels_in_videos:
            print(f"Available channels ({len(channels_in_videos)}):")
            for ch in sorted(channels_in_videos):
                print(f"  - {ch}")
        else:
            print("No channel folders found.")
        sys.exit(1)

    if len(matched) > 1:
        # Extremely unlikely on Windows (case-insensitive FS), but be explicit.
        print(f"Error: Multiple channels match '{target_channel}': {matched}")
        sys.exit(1)

    return matched[0]


def scan_videos_directory(videos_dir, videostats_dir, subcount_dir,
                          viewcounts_dir, overwrite=False, target_channel=None):

    if not os.path.exists(videostats_dir):
        os.makedirs(videostats_dir)

    print("Scanning for media files...", end="\r")

    if not os.path.exists(videos_dir):
        print(f"Error: Videos directory not found at {videos_dir}")
        return

    all_channels = [d for d in os.listdir(videos_dir)
                    if os.path.isdir(os.path.join(videos_dir, d))]

    resolved = resolve_target_channel(target_channel, all_channels)
    if resolved is not None:
        channels_to_process = [resolved]
        print(f"Restricting to channel: {resolved}                    \r")
    else:
        channels_to_process = all_channels

    files_to_process = []

    for channel_dir in channels_to_process:
        channel_path = os.path.join(videos_dir, channel_dir)

        subcount_file_path = os.path.join(subcount_dir, f"{channel_dir}.txt")
        if not os.path.exists(subcount_file_path):
            continue

        try:
            with open(subcount_file_path, 'r', encoding='utf-8') as subcount_file:
                subscriber_count = int(subcount_file.read().strip().replace(',', ''))
        except ValueError:
            continue

        for root, _, files in os.walk(channel_path):
            for filename in files:
                if filename.endswith(('.mp4', '.mp3')):
                    files_to_process.append((channel_dir, subscriber_count, root, filename))

    total_files = len(files_to_process)

    if total_files == 0:
        if resolved is not None:
            print(f"No video/audio files found for channel '{resolved}' (or missing subcount file).             ")
        else:
            print("No video/audio files found (or missing subcounts).             ")
        return

    created_count = 0
    skipped_count = 0
    error_count = 0
    from_file = 0
    from_estimate = 0

    for i, (channel_dir, subscriber_count, root, filename) in enumerate(files_to_process, 1):

        status_msg = f"Processing file #{i}/{total_files}... (New: {created_count})"
        sys.stdout.write(status_msg.ljust(65) + "\r")
        sys.stdout.flush()

        try:
            video_name = os.path.splitext(filename)[0]
            relative_path = os.path.relpath(root, os.path.join(videos_dir, channel_dir))

            if relative_path == '.':
                videostats_subdir = os.path.join(videostats_dir, channel_dir)
                viewcounts_path   = os.path.join(viewcounts_dir, channel_dir, f"{video_name}.txt")
            else:
                videostats_subdir = os.path.join(videostats_dir, channel_dir, relative_path)
                viewcounts_path   = os.path.join(viewcounts_dir, channel_dir, relative_path, f"{video_name}.txt")

            if not os.path.exists(videostats_subdir):
                os.makedirs(videostats_subdir)

            txt_file_path = os.path.join(videostats_subdir, f"{video_name}.txt")

            if not overwrite and os.path.exists(txt_file_path):
                skipped_count += 1
                continue

            view_count, source = read_view_count(viewcounts_path)
            if view_count is None:
                view_count = estimate_view_count(subscriber_count)
                from_estimate += 1
            else:
                from_file += 1

            with open(txt_file_path, 'w', encoding='utf-8') as txt_file:
                txt_file.write(generate_like_dislike_counts(view_count))

            created_count += 1

        except Exception as e:
            print(f"\nError processing '{filename}': {e}")
            error_count += 1

    # Clear status line and print final summary
    sys.stdout.write(" " * 65 + "\r")
    sys.stdout.flush()

    scope = f"channel '{resolved}'" if resolved else "all channels"
    print(f"VideoStats Update Complete ({scope}):")
    print(f"  Total Files Scanned:    {total_files}")
    print(f"  New Stats Written:      {created_count}")
    print(f"  Skipped (Exist):        {skipped_count}")
    print(f"  Views read from file:   {from_file}")
    print(f"  Views estimated:        {from_estimate}")

    if error_count > 0:
        print(f"  Errors:                 {error_count}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate realistic like/dislike counts for LocalYT videos."
    )
    parser.add_argument(
        "--channel",
        type=str,
        default=None,
        help="Only process this channel folder (case-insensitive). "
             "Example: --channel Domtendo"
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Regenerate existing videostats files (use after views are generated)."
    )
    args = parser.parse_args()

    # --- DYNAMIC PATH RESOLUTION ---
    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent

    videos_dir      = root_dir / "videos"
    videostats_dir  = root_dir / "videostats"
    subcount_dir    = root_dir / "subcount"
    viewcounts_dir  = root_dir / "viewcounts"
    # -------------------------------

    scan_videos_directory(
        videos_dir, videostats_dir, subcount_dir, viewcounts_dir,
        overwrite=args.overwrite,
        target_channel=args.channel,
    )