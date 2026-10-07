import os
import json
import urllib.request
import time
import re
import math
import hashlib

# Configuration
LLAMA_SERVER_URL = "http://127.0.0.1:8081"
media_list = "media_list.txt"
media_list_skip = "media_list_skip.txt"

# Get the directory where this script is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TAG_GROUPS_FILE = os.path.join(SCRIPT_DIR, "tag_groups.json")
CACHE_FILE = os.path.join(SCRIPT_DIR, "tag_embeddings_cache.json")
AUTO_TAG_RULES_FILE = os.path.join(SCRIPT_DIR, "auto_tag_rules.json")

# Updated output directory - go up one level from script directory and then into "videos"
PARENT_DIR = os.path.dirname(SCRIPT_DIR)
OUTPUT_DIR = os.path.join(PARENT_DIR, "videos")
DESCRIPTIONS_DIR = os.path.join(PARENT_DIR, "descriptions")

DEFAULT_TAG = "Uncategorized"  # Default tag if the model fails to choose one
SERVER_TIMEOUT = 120

def read_media_list(file_path):
    """Read the list of media filenames from a .txt file."""
    with open(file_path, "r", encoding='utf-8') as f:
        media_files = [line.strip() for line in f.readlines() if line.strip()]
    return media_files

def get_file_hash(filepath):
    """Generates an MD5 hash of a file to detect changes."""
    hasher = hashlib.md5()
    with open(filepath, 'rb') as f:
        hasher.update(f.read())
    return hasher.hexdigest()

def load_tag_data():
    """Load tags and groups from tag_groups.json and flatten them."""
    with open(TAG_GROUPS_FILE, 'r', encoding='utf-8') as f:
        groups = json.load(f)
        
    all_tags = []
    tag_to_group = {}
    for group_name, tags in groups.items():
        for tag in tags:
            if tag not in tag_to_group:
                all_tags.append(tag)
                tag_to_group[tag] = group_name
    return all_tags, tag_to_group

def load_auto_tag_rules(file_path):
    """Load automatic tag rules from a JSON file."""
    if not os.path.exists(file_path):
        print(f"No auto-tag rules file found at {file_path}. Using empty rules.")
        return []
    
    with open(file_path, 'r', encoding='utf-8') as f:
        rules_data = json.load(f)
    
    rules = rules_data.get("auto_tag_rules", [])
    print(f"Loaded {len(rules)} auto-tag rules from {file_path}")
    return rules

def apply_auto_tag_rules(video_name, rules):
    """
    Apply automatic tag rules to a video.
    """
    for rule in rules:
        match_type = rule.get("match_type", "contains")
        match_value = rule.get("match_value", "")
        case_sensitive = rule.get("case_sensitive", False)
        tags = rule.get("tags", [])
        rule_name = rule.get("name", "Unnamed Rule")
        
        if not tags:
            continue
        
        if isinstance(match_value, str):
            match_values = [match_value]
        elif isinstance(match_value, list):
            match_values = match_value
        else:
            continue
        
        video_name_for_match = video_name if case_sensitive else video_name.lower()
        
        matched = False
        for current_match_value in match_values:
            if not current_match_value:
                continue
                
            match_value_for_match = current_match_value if case_sensitive else current_match_value.lower()
            
            if match_type == "contains":
                if match_value_for_match in video_name_for_match:
                    matched = True
                    break
            elif match_type == "extension":
                if video_name_for_match.endswith(match_value_for_match):
                    matched = True
                    break
            elif match_type == "starts_with":
                if video_name_for_match.startswith(match_value_for_match):
                    matched = True
                    break
            elif match_type == "ends_with":
                if video_name_for_match.endswith(match_value_for_match):
                    matched = True
                    break
            elif match_type == "regex":
                flags = 0 if case_sensitive else re.IGNORECASE
                try:
                    if re.search(current_match_value, video_name, flags):
                        matched = True
                        break
                except re.error as e:
                    print(f"  Warning: Invalid regex in rule '{rule_name}': {e}")
                    matched = False
            else:
                continue

        if matched:
            return tags, rule_name
    
    return None, None

def get_video_description(video_name):
    """Get the description for a video if it exists."""
    try:
        video_name_without_ext = os.path.splitext(video_name)[0]
        parts = video_name_without_ext.split(os.path.sep)
        
        if len(parts) >= 2:
            channel = parts[0]
            video_file = parts[-1]
            description_path = os.path.join(DESCRIPTIONS_DIR, channel, f"{video_file}.txt")
            
            if os.path.exists(description_path):
                with open(description_path, "r", encoding="utf-8") as f:
                    description = f.read().strip()
                if len(description) > 1000:
                    description = description[:1000] + "... [truncated]"
                return description
        return None
    except Exception as e:
        print(f"Error reading description for {video_name}: {e}")
        return None

def get_batch_embeddings(texts: list) -> list:
    """Fetches embeddings for a list of texts in a single API call."""
    url = f"{LLAMA_SERVER_URL}/v1/embeddings"
    prompts = [f"task: classification | query: {t}" for t in texts]
    payload = {"input": prompts, "model": "embeddinggemma-2"}
    data = json.dumps(payload).encode('utf-8')
    
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=SERVER_TIMEOUT) as response:
            resp_json = json.loads(response.read().decode('utf-8'))
            resp_data = resp_json['data']
            if resp_data and 'index' in resp_data[0]:
                resp_data.sort(key=lambda x: x['index'])
            return [item['embedding'] for item in resp_data]
    except Exception as e:
        print(f"  [Warning] Batch embedding failed: {e}")
        return None

def cosine_similarity(vec1, vec2):
    if not vec1 or not vec2 or len(vec1) != len(vec2):
        return 0.0
    dot_product = sum(v1 * v2 for v1, v2 in zip(vec1, vec2))
    mag1 = math.sqrt(sum(v1**2 for v1 in vec1))
    mag2 = math.sqrt(sum(v2**2 for v2 in vec2))
    if mag1 == 0 or mag2 == 0:
        return 0.0
    return dot_product / (mag1 * mag2)

def load_or_compute_tag_embeddings(all_tags):
    """Load cached tags if hash matches, otherwise compute and cache them."""
    current_hash = get_file_hash(TAG_GROUPS_FILE)
    tag_embeddings = {}
    needs_recompute = True
    
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, 'r', encoding='utf-8') as f:
            cache_data = json.load(f)
            if cache_data.get("hash") == current_hash:
                print("Tag pool unchanged. Loading cached embeddings...")
                tag_embeddings = cache_data.get("embeddings", {})
                needs_recompute = False
            else:
                print("Tag pool has changed! Recomputing embeddings...")
                
    if needs_recompute:
        print(f"Pre-computing embeddings for {len(all_tags)} tags...")
        BATCH_SIZE = 32
        for i in range(0, len(all_tags), BATCH_SIZE):
            batch_tags = all_tags[i:i+BATCH_SIZE]
            batch_embs = get_batch_embeddings(batch_tags)
            
            if not batch_embs:
                print("  [Error] Failed to compute tag embeddings. Is llama-server running?")
                return None
            
            for tag, emb in zip(batch_tags, batch_embs):
                tag_embeddings[tag] = emb
            print(f"  Processed {min(i + BATCH_SIZE, len(all_tags))}/{len(all_tags)} tags...")
        
        print("Saving new cache...")
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump({"hash": current_hash, "embeddings": tag_embeddings}, f)
            
    return tag_embeddings

def generate_tags_for_video(video_name, tag_embeddings, auto_tag_rules):
    """Choose two tags via auto-rules or embedding similarity."""
    parts = video_name.split(os.path.sep)
    channel_name = parts[0] if len(parts) >= 2 else "Unknown"
    
    auto_tags, rule_name = apply_auto_tag_rules(video_name, auto_tag_rules)
    if auto_tags is not None:
        while len(auto_tags) < 2:
            if channel_name not in auto_tags:
                auto_tags.append(channel_name)
            else:
                auto_tags.append(DEFAULT_TAG)
        print(f"  Auto-tagged by rule '{rule_name}': {auto_tags[0]}, {auto_tags[1]}")
        return auto_tags[:2]
    
    print(f"  Using Embeddings for: {video_name}")
    description = get_video_description(video_name)
    
    abbreviation_map = {
        "GTA": "Grand Theft Auto",
        "CoD": "Call of Duty",
        "AC": "Assassin's Creed",
        "PS1": "Playstation 1",
        "PS2": "Playstation 2",
        "PS3": "Playstation 3",
        "PS4": "Playstation 4",
        "PS5": "Playstation 5",
    }
    video_name_processed = video_name
    for abbrev, full_name in abbreviation_map.items():
        video_name_processed = video_name_processed.replace(abbrev, full_name)

    search_text = video_name_processed
    if description:
        search_text += f" | {description}"
        
    video_emb = get_batch_embeddings([search_text])
    if not video_emb or not video_emb[0]:
        print("  Failed to get embedding for video. Skipping.")
        return None
    video_emb = video_emb[0]
    
    results = []
    for tag, emb in tag_embeddings.items():
        if emb:
            sim = cosine_similarity(video_emb, emb)
            results.append((tag, sim))
            
    results.sort(key=lambda x: x[1], reverse=True)
    
    # Take the top 2 tags
    valid_tags = [tag for tag, score in results[:2]]
    
    if len(valid_tags) < 2:
        return None
        
    return valid_tags

def save_tags_to_file(video_name, tags, output_dir):
    """Save the chosen tags to a .txt file in the specified output directory."""
    try:
        video_dir = os.path.dirname(video_name)
        if video_dir:
            output_path = os.path.join(output_dir, video_dir)
        else:
            output_path = output_dir
        
        if not os.path.exists(output_path):
            os.makedirs(output_path, exist_ok=True)
            print(f"  Created directory: {output_path}")
        
        base_name = os.path.splitext(os.path.basename(video_name))[0]
        parts = video_name.split(os.path.sep)
        channel_name = parts[0] if len(parts) >= 2 else "Root"
        
        tags_with_channel = tags + [channel_name]
        tag_file = os.path.join(output_path, f"{base_name}.txt")
        
        with open(tag_file, "w", encoding='utf-8') as f:
            f.write(f"{tags_with_channel[0]}, {tags_with_channel[1]}, {tags_with_channel[2]}\n")
        
        print(f"  Tags saved to: {tag_file}")
    except Exception as e:
        print(f"  ERROR saving tags: {e}")
        raise

def add_to_skip_list(video_name):
    """Appends a failed video name to the media_list_skip.txt file."""
    skip_list_path = os.path.join(SCRIPT_DIR, media_list_skip)
    try:
        with open(skip_list_path, "a", encoding='utf-8') as f:
            f.write(f"{video_name}\n")
        print(f"  Added to skip list: {skip_list_path}")
    except Exception as e:
        print(f"  ERROR adding to skip list: {e}")

def main():
    print(f"Loading tags from: {TAG_GROUPS_FILE}")
    all_tags, tag_to_group = load_tag_data()
    print(f"Loaded {len(all_tags)} allowed tags.")
    
    # Precompute or load tag embeddings
    tag_embeddings = load_or_compute_tag_embeddings(all_tags)
    if not tag_embeddings:
        print("Fatal: Could not load tag embeddings. Exiting.")
        return

    auto_tag_rules = load_auto_tag_rules(AUTO_TAG_RULES_FILE)
    print(f"Looking for descriptions in: {DESCRIPTIONS_DIR}")

    media_list_path = os.path.join(SCRIPT_DIR, media_list)
    print(f"Looking for media list at: {media_list_path}")
    media_files = read_media_list(media_list_path)
    print(f"Found {len(media_files)} media files in the list.")
    
    skip_list_path = os.path.join(SCRIPT_DIR, media_list_skip)
    skip_count = 0
    if os.path.exists(skip_list_path):
        skip_files = read_media_list(skip_list_path)
        skip_set = set(skip_files)
        original_count = len(media_files)
        media_files = [f for f in media_files if f not in skip_set]
        skip_count = original_count - len(media_files)
        print(f"Found {len(skip_files)} files in skip list. {skip_count} files will be skipped.")
    
    print(f"Output will be saved to: {OUTPUT_DIR}")
    
    if not media_files:
        print("No media files to process. Exiting.")
        return

    auto_tag_count = 0
    llm_count = 0
    llm_failed_count = 0
    rule_match_counts = {}
    
    for index, media_name in enumerate(media_files, 1):
        print(f"\nProcessing {index}/{len(media_files)}: {media_name}")
        try:
            tags = generate_tags_for_video(media_name, tag_embeddings, auto_tag_rules)
            
            if tags is None:
                print(f"  Skipping {media_name} - no tags generated.")
                add_to_skip_list(media_name)
                llm_failed_count += 1
                continue
                
            print(f"  Chosen Tags: {tags[0]}, {tags[1]}")
            save_tags_to_file(media_name, tags, OUTPUT_DIR)
            
            _, rule_name = apply_auto_tag_rules(media_name, auto_tag_rules)
            if rule_name is not None:
                auto_tag_count += 1
                rule_match_counts[rule_name] = rule_match_counts.get(rule_name, 0) + 1
            else:
                llm_count += 1
                
        except Exception as e:
            print(f"  Error processing {media_name}: {e}")
            add_to_skip_list(media_name)
            llm_failed_count += 1

    print(f"\n{'='*50}")
    print(f"COMPLETED! Processed {len(media_files)} media files:")
    print(f"  - Skipped (via skip list): {skip_count}")
    print(f"  - Auto-tagged (rules): {auto_tag_count}")
    if rule_match_counts:
        print(f"    Rule breakdown:")
        for rule_name, count in sorted(rule_match_counts.items(), key=lambda x: -x[1]):
            print(f"      - {rule_name}: {count}")
    print(f"  - Embedding-processed (success): {llm_count}")
    print(f"  - Failed (added to skip list): {llm_failed_count}")
    print(f"{'='*50}")

if __name__ == "__main__":
    main()