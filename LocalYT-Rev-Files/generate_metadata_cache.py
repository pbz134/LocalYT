#!/usr/bin/env python3
"""
generate_metadata_cache.py (incremental)

Aggregates all per-video and per-channel metadata into a single metadata_cache.json.

Incremental behaviour:
- Reads the previous metadata_cache.json and its companion metadata_cache_versions.json
- Fingerprints each channel folder (mtime + total size + video count)
- Only rescans channels whose fingerprint changed, is new, or was passed via -c
- Removes entries for channels that no longer exist
- Re-scans playlist-orders/ fully (595 files — always cheap)

Companion file: metadata_cache_versions.json
  { "channelName": {"mtime": <ns>, "size": <bytes>, "count": <videos>}, ... }

Usage:
  generate_metadata_cache.py                        # incremental (default)
  generate_metadata_cache.py --force                # rebuild from scratch
  generate_metadata_cache.py -c "ChannelName"       # rescan one channel, merge into cache
  generate_metadata_cache.py --workers 4            # parallel channel scan (SSD only)

Descriptions are NOT cached (--skip-descriptions is the default and only mode now);
video.html fetches the one description it needs on demand.
"""

import os
import json
import sys
import argparse
import datetime
from pathlib import Path

SCRIPT_DIR   = Path(__file__).resolve().parent
ROOT_DIR     = SCRIPT_DIR.parent
VIDEOS_DIR   = ROOT_DIR / "videos"

CACHE_FILE    = ROOT_DIR / "metadata_cache.json"
VERSIONS_FILE = ROOT_DIR / "metadata_cache_versions.json"

VIDEO_EXTENSIONS = ('.mp4', '.mkv', '.mp3', '.avi', '.mov', '.wmv', '.flv', '.webm')


def log(msg):
    sys.stdout.write(msg + "\n")
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# Fast per-channel metadata indexing — one walk per directory, O(1) lookups
# ---------------------------------------------------------------------------

def _walk_index(dir_path, suffix):
    """Return {relative_path_without_suffix: absolute_path} using one os.walk."""
    out = {}
    if not dir_path.exists():
        return out
    for root, _dirs, files in os.walk(dir_path):
        for f in files:
            if f.startswith('._') or not f.endswith(suffix):
                continue
            full = os.path.join(root, f)
            rel  = os.path.relpath(full, dir_path).replace(os.sep, '/')
            out[rel[:-len(suffix)]] = full
    return out


def build_channel_index(channel_name):
    """Index all metadata folders for one channel in a single pass each."""
    base = ROOT_DIR
    idx = {
        'filenames':        _walk_index(base / "filenames"        / channel_name, ".txt"),
        'filedates':        _walk_index(base / "filedates"        / channel_name, ".txt"),
        'viewcounts':       _walk_index(base / "viewcounts"       / channel_name, ".txt"),
        'videolengths':     _walk_index(base / "videolengths"     / channel_name, ".txt"),
        'videostats':       _walk_index(base / "videostats"       / channel_name, ".txt"),
        'videoresolutions': _walk_index(base / "videoresolutions" / channel_name, ".txt"),
        'comments':         _walk_index(base / "comments"         / channel_name, ".json"),
        'livechats':        _walk_index(base / "livechats"        / channel_name, ".json"),
    }

    # Subtitles: single readdir of the channel's subtitle folder → {video_name: [langs]}
    sub_dir = base / "subtitles" / channel_name
    subs = {}
    if sub_dir.exists():
        for f in os.listdir(sub_dir):
            if f.startswith('._') or not f.endswith('.vtt'):
                continue
            stem = f[:-4]                       # strip ".vtt"
            if '.' in stem:
                name, lang = stem.rsplit('.', 1)
                subs.setdefault(name, []).append(lang)
            else:
                subs.setdefault(stem, []).append('')
    idx['subtitles'] = subs
    return idx


# ---------------------------------------------------------------------------
# Fingerprint — cheap change detection (stat only, no file reads)
# ---------------------------------------------------------------------------

def snapshot_channel(channel_dir):
    """Return {'mtime': ns, 'size': bytes, 'count': videos} using os.scandir cache."""
    try:
        st = channel_dir.stat()
    except OSError:
        return None

    total_size = 0
    count = 0

    def walk(dir_path):
        nonlocal total_size, count
        try:
            entries = list(os.scandir(dir_path))
        except OSError:
            return
        for entry in entries:
            if entry.name.startswith('._'):
                continue
            try:
                if entry.is_dir(follow_symlinks=False):
                    walk(entry.path)
                elif entry.name.lower().endswith(VIDEO_EXTENSIONS):
                    # On NTFS, entry.stat() is served from the readdir cache — free
                    total_size += entry.stat(follow_symlinks=False).st_size
                    count += 1
            except OSError:
                pass

    walk(channel_dir)
    return {'mtime': st.st_mtime_ns, 'size': total_size, 'count': count}


# ---------------------------------------------------------------------------
# Per-video scan using the pre-built index
# ---------------------------------------------------------------------------

def _read_text(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read().strip()
    except Exception:
        return None


def scan_video(file_path, idx):
    """Build the metadata object for one video using the channel index."""
    rel       = file_path.relative_to(VIDEOS_DIR).as_posix()
    base_path = os.path.splitext(rel)[0]              # "channel/pl/video"
    name      = os.path.splitext(file_path.name)[0]   # "video" (for videolengths/livechats)

    m = {}

    if (p := idx['filenames'].get(base_path)):        m['displayName'] = _read_text(p)
    if (p := idx['filedates'].get(base_path)):        m['fileDate']    = _read_text(p)
    if (p := idx['viewcounts'].get(base_path)):       m['viewCount']   = _read_text(p)
    if (p := idx['videolengths'].get(name)):          m['videoLength'] = _read_text(p)

    if (p := idx['videostats'].get(base_path)):
        txt = _read_text(p)
        if txt:
            parts = txt.split(',')
            try:
                m['likes']    = int(parts[0])
                m['dislikes'] = int(parts[1]) if len(parts) > 1 else 0
            except (ValueError, IndexError):
                pass

    if (p := idx['videoresolutions'].get(base_path)):
        txt = _read_text(p)
        if txt:
            lines = txt.splitlines()
            if len(lines) >= 1: m['resolution'] = lines[0].strip()
            if len(lines) >= 2: m['codec']      = lines[1].strip()

    m['hasThumbnail']      = (ROOT_DIR / "thumbnails"       / f"{base_path}.jpg").exists()
    m['hasThumbnailSmall'] = (ROOT_DIR / "thumbnails-small" / f"{base_path}.jpg").exists()
    m['hasComments']       = base_path in idx['comments']
    m['hasLiveChat']       = name      in idx['livechats']

    if name in idx['subtitles']:
        m['subtitles'] = idx['subtitles'][name]

    return rel, m


def scan_channel_videos(channel_dir, idx):
    videos = {}
    for root, _dirs, files in os.walk(channel_dir):
        for fname in files:
            if fname.startswith('._') or not fname.lower().endswith(VIDEO_EXTENSIONS):
                continue
            try:
                rel, meta = scan_video(Path(root) / fname, idx)
                videos[rel] = meta
            except Exception as e:
                print(f"  [warn] {fname}: {e}")
    return videos


def scan_channel_meta(channel_name):
    m = {}
    m['hasPic']    = (ROOT_DIR / "channelpic"    / f"{channel_name}.jpg").exists()
    m['hasBanner'] = (ROOT_DIR / "channelbanner" / f"{channel_name}.jpg").exists()

    d = _read_text(ROOT_DIR / "channeldesc" / f"{channel_name}.txt")
    if d is not None: m['description'] = d
    s = _read_text(ROOT_DIR / "subcount" / f"{channel_name}.txt")
    if s is not None: m['subCount'] = s
    fs = _read_text(ROOT_DIR / "subcount" / "fuzzy" / f"{channel_name}.txt")
    if fs is not None: m['fuzzySubCount'] = fs

    st = ROOT_DIR / "channelstats" / f"{channel_name}.json"
    if st.exists():
        try:
            with open(st, 'r', encoding='utf-8') as f:
                m['stats'] = json.load(f)
        except Exception:
            pass

    t = _read_text(ROOT_DIR / "channeltags" / f"{channel_name}.txt")
    if t is not None:
        m['tags'] = [x.strip() for x in t.split(',') if x.strip()]

    return m


# ---------------------------------------------------------------------------
# Playlists — cheap, always fully re-scanned
# ---------------------------------------------------------------------------

def scan_playlists():
    out = {}
    orders_root = ROOT_DIR / "playlist-orders"
    if not orders_root.exists():
        return out

    for channel_dir in orders_root.iterdir():
        if not channel_dir.is_dir() or channel_dir.name.startswith('._'):
            continue
        channel_name = channel_dir.name
        for order_file in channel_dir.rglob("*.jsonl"):
            rel_pl = order_file.relative_to(channel_dir).with_suffix("").as_posix()
            key    = f"{channel_name}/{rel_pl}"

            paths = []
            try:
                with open(order_file, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if not line: continue
                        try:
                            obj = json.loads(line)
                            if 'path' in obj:
                                paths.append(obj['path'])
                        except json.JSONDecodeError:
                            pass
            except Exception:
                pass

            entry = {'order': paths}
            if paths:
                first = os.path.splitext(paths[0])[0]
                if (ROOT_DIR / "thumbnails" / f"{first}.jpg").exists():
                    entry['thumbnail'] = f"/thumbnails/{first}.jpg"
            out[key] = entry
    return out


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def load_json(path, default):
    if not path.exists():
        return default
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        log(f"  [warn] Could not read {path.name}: {e} — falling back to fresh build")
        return default


def save_json(path, data):
    tmp = path.with_suffix(path.suffix + '.tmp')
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)


def discover_channels():
    if not VIDEOS_DIR.exists():
        return []
    return sorted(
        d for d in VIDEOS_DIR.iterdir()
        if d.is_dir() and not d.name.startswith('.')
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Build/update metadata_cache.json (incremental)")
    ap.add_argument('-c', '--channel', help="Rescan only this channel and merge into existing cache")
    ap.add_argument('-o', '--output',  default=str(CACHE_FILE))
    ap.add_argument('--force',   action='store_true', help="Ignore previous cache; full rebuild")
    ap.add_argument('--workers', type=int, default=1,
                    help="Parallel channel workers (default 1; try 4-8 on SSD)")
    args = ap.parse_args()

    cache_path    = Path(args.output)
    versions_path = cache_path.parent / "metadata_cache_versions.json"

    if not VIDEOS_DIR.exists():
        log(f"Error: {VIDEOS_DIR} does not exist")
        sys.exit(1)

    # ---- 1. Load previous state ----
    cache_exists = cache_path.exists() and not args.force
    if cache_exists:
        old_cache    = load_json(cache_path,    {'videos': {}, 'channels': {}, 'playlists': {}})
        old_versions = load_json(versions_path, {})
        # If cache exists but versions file is missing, we can't do incremental safely
        if not old_versions:
            log("  [info] versions file missing — full rebuild required this run.")
            cache_exists = False
    if not cache_exists:
        old_cache    = {'videos': {}, 'channels': {}, 'playlists': {}}
        old_versions = {}

    for key in ('videos', 'channels', 'playlists'):
        old_cache.setdefault(key, {})

    # ---- 2. Snapshot every channel ----
    all_channel_dirs = discover_channels()
    log(f"Snapshotting {len(all_channel_dirs)} channel folder(s)...")

    current_snapshots = {}
    for i, ch_dir in enumerate(all_channel_dirs, 1):
        snap = snapshot_channel(ch_dir)
        if snap is not None:
            current_snapshots[ch_dir.name] = snap
        if i % 100 == 0 or i == len(all_channel_dirs):
            sys.stdout.write(f"\r  {i}/{len(all_channel_dirs)}")
            sys.stdout.flush()
    sys.stdout.write("\r" + " " * 40 + "\r")
    sys.stdout.flush()

    # ---- 3. Classify ----
    target = args.channel
    if target and target not in current_snapshots:
        log(f"Error: channel '{target}' not found in videos/")
        sys.exit(1)

    to_scan          = []
    removed_channels = []

    if target:
        to_scan.append(target)
        # Also pick up any genuinely-new channels so -c doesn't leave drift behind
        for name in current_snapshots:
            if name not in old_versions and name not in to_scan:
                to_scan.append(name)
    else:
        for name, snap in current_snapshots.items():
            if not cache_exists or old_versions.get(name) != snap:
                to_scan.append(name)
        for name in old_versions:
            if name not in current_snapshots:
                removed_channels.append(name)

    unchanged = len(current_snapshots) - len(to_scan)
    log(f"  To scan:  {len(to_scan)} channel(s)")
    log(f"  Unchanged:{unchanged}")
    log(f"  Removed:  {len(removed_channels)}")

    # ---- 4. Scan ----
    new_videos       = {}
    new_channel_meta = {}

    def _scan_one(ch_name):
        idx   = build_channel_index(ch_name)
        vids  = scan_channel_videos(VIDEOS_DIR / ch_name, idx)
        cmeta = scan_channel_meta(ch_name)
        return ch_name, vids, cmeta

    total = len(to_scan)
    if total == 0:
        log("  Nothing to rescan.")
    elif args.workers > 1 and total > 1:
        from concurrent.futures import ThreadPoolExecutor, as_completed
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = {pool.submit(_scan_one, name): name for name in to_scan}
            done = 0
            for fut in as_completed(futures):
                name, vids, cmeta = fut.result()
                new_videos[name]       = vids
                new_channel_meta[name] = cmeta
                done += 1
                sys.stdout.write(f"\r  Scanning {done}/{total}: {name[:50]:<50}")
                sys.stdout.flush()
        sys.stdout.write("\r" + " " * 80 + "\r")
        sys.stdout.flush()
    else:
        for i, name in enumerate(to_scan, 1):
            sys.stdout.write(f"\r  Scanning {i}/{total}: {name[:50]:<50}")
            sys.stdout.flush()
            _, vids, cmeta = _scan_one(name)
            new_videos[name]       = vids
            new_channel_meta[name] = cmeta
        sys.stdout.write("\r" + " " * 80 + "\r")
        sys.stdout.flush()

    # ---- 5. Merge ----
    merged_videos   = dict(old_cache['videos'])
    merged_channels = dict(old_cache['channels'])

    for name in removed_channels:
        prefix = name + '/'
        merged_videos = {k: v for k, v in merged_videos.items() if not k.startswith(prefix)}
        merged_channels.pop(name, None)

    for name in to_scan:
        prefix = name + '/'
        for k in [k for k in merged_videos if k.startswith(prefix)]:
            del merged_videos[k]

    for name, vids in new_videos.items():
        merged_videos.update(vids)
        merged_channels[name] = new_channel_meta[name]

    # ---- 6. Playlists (always full re-scan — cheap) ----
    log("Scanning playlists...")
    merged_playlists = scan_playlists()

    # ---- 7. Write ----
    out = {
        'generated_at': datetime.datetime.now().isoformat(timespec='seconds'),
        'videos':    merged_videos,
        'channels':  merged_channels,
        'playlists': merged_playlists,
    }
    save_json(cache_path,    out)
    save_json(versions_path, current_snapshots)

    size_mb = cache_path.stat().st_size / (1024 * 1024)
    log(f"\nWrote {len(merged_videos):,} videos, {len(merged_channels)} channels, "
        f"{len(merged_playlists)} playlists → {size_mb:.2f} MB")
    log(f"  → {cache_path}")
    log(f"  → {versions_path}")


if __name__ == '__main__':
    main()