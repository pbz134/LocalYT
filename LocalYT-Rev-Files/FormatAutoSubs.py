import os
import re
import sys
import glob

def parse_time(time_str):
    h, m, s_ms = time_str.split(':')
    s, ms = s_ms.split('.')
    return int(h) * 3600000 + int(m) * 60000 + int(s) * 1000 + int(ms)

def format_time(ms):
    h = ms // 3600000
    m = (ms % 3600000) // 60000
    s = (ms % 60000) // 1000
    millis = ms % 1000
    return f"{h:02d}:{m:02d}:{s:02d}.{millis:03d}"

def fix_vtt_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Strip YouTube's proprietary tags
    content = re.sub(r'<[0-9:.]+><c>', '', content)
    content = re.sub(r'</c>', '', content)

    # Split into blocks
    blocks = re.split(r'\n\n+', content.strip())
    header = blocks[0]
    cues = []
    
    # 2. Parse cues
    for block in blocks[1:]:
        lines = block.strip().split('\n')
        if len(lines) >= 2 and '-->' in lines[0]:
            time_match = re.match(r'(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})', lines[0].strip())
            if time_match:
                start = parse_time(time_match.group(1))
                end = parse_time(time_match.group(2))
                text_lines = [l.strip() for l in lines[1:] if l.strip()]
                text = ' '.join(text_lines)
                cues.append({'start': start, 'end': end, 'text': text})

    if not cues:
        return False

    # 3. Keep only the 10ms "Ghost" frames (which contain the clean text)
    clean_cues = []
    for i, cue in enumerate(cues):
        duration = cue['end'] - cue['start']
        if duration <= 20:
            if i > 0:
                cue['start'] = cues[i-1]['start'] # Stretch backwards
            clean_cues.append(cue)
        elif i == len(cues) - 1:
            clean_cues.append(cue) # Always keep the last cue

    # 4. Merge fragmented cues into natural sentences
    MAX_WORDS = 10  # Maximum words per subtitle line
    merged_cues = []
    
    for cue in clean_cues:
        # If we have a previous cue, try to merge into it
        if merged_cues:
            prev = merged_cues[-1]
            combined_text = prev['text'] + ' ' + cue['text']
            word_count = len(combined_text.split())
            
            # Merge if: combined word count is small enough, AND no hard punctuation ends the previous line
            if word_count <= MAX_WORDS and not prev['text'].rstrip()[-1:] in '.!?':
                prev['text'] = combined_text
                prev['end'] = cue['end']
                continue # Skip adding as a new cue, it's merged
                
        # Otherwise, add as a brand new line
        merged_cues.append({'start': cue['start'], 'end': cue['end'], 'text': cue['text']})

    # 5. Rebuild the file
    output_lines = [header]
    for cue in merged_cues:
        output_lines.append(f"\n{format_time(cue['start'])} --> {format_time(cue['end'])}\n{cue['text']}")
    
    new_content = '\n'.join(output_lines) + '\n'

    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return True
        
    return False

def main(target_dir):
    print(f"Recursively cleaning VTT files in: {target_dir}")
    search_path = os.path.join(target_dir, '**', '*.vtt')
    vtt_files = glob.glob(search_path, recursive=True)
    
    if not vtt_files:
        print("No .vtt files found.")
        return

    changed_count = 0
    for filepath in vtt_files:
        try:
            if fix_vtt_file(filepath):
                print(f"Fixed: {filepath}")
                changed_count += 1
            else:
                print(f"Skipped (already clean): {filepath}")
        except Exception as e:
            print(f"Error processing {filepath}: {e}")

    print(f"\nDone! Modified {changed_count} out of {len(vtt_files)} files.")

if __name__ == "__main__":
    # Get the directory where the script is currently located
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Go up one level to the parent directory
    parent_dir = os.path.dirname(script_dir)
    
    # Point specifically to the /subtitles folder inside the parent directory
    target_directory = os.path.join(parent_dir, "subtitles")
    
    main(target_directory)