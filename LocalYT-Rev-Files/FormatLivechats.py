import os
import json
from datetime import datetime

def parse_offset_to_ms(offset_val):
    """
    Converts the messy 'videoOffsetTimeMsec' value into clean Milliseconds.
    Handles strings like "-2:59", "1:05:10", or raw numbers.
    """
    if not offset_val:
        return None

    # Case 1: It's already a number (milliseconds)
    if isinstance(offset_val, (int, float)):
        return int(offset_val)

    # Case 2: It's a string representation of a number
    if offset_val.isdigit():
        return int(offset_val)

    # Case 3: It's a time string (e.g., "-2:59", "1:05:10", "15:20")
    # We remove negative signs if they exist
    s = str(offset_val).replace('-', '').strip()
    
    parts = s.split(':')
    
    try:
        if len(parts) == 3: # HH:MM:SS
            h, m, sec = map(int, parts)
            total_sec = h * 3600 + m * 60 + sec
        elif len(parts) == 2: # MM:SS
            m, sec = map(int, parts)
            total_sec = m * 60 + sec
        else:
            return None
            
        return total_sec * 1000 # Convert to ms
        
    except ValueError:
        return None

def extract_messages_for_player(file_path):
    """
    Extracts messages optimized for Video Player integration.
    Output: { "offsetMs": ..., "author": ..., "message": ... }
    """
    messages = []
    
    # We keep track of timestamps to calculate offsets if they are missing
    last_known_real_timestamp_us = 0 
    last_known_calculated_offset_ms = -1

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # --- PARSING LOGIC ---
        data = None
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            pass

        items_to_process = []

        if isinstance(data, list):
            items_to_process = data
        elif isinstance(data, dict):
            items_to_process = [data]
        else:
            decoder = json.JSONDecoder()
            idx = 0
            text_len = len(content)
            while idx < text_len:
                while idx < text_len and content[idx] in ' \t\n\r':
                    idx += 1
                if idx >= text_len:
                    break
                try:
                    obj, end_idx = decoder.raw_decode(content, idx)
                    items_to_process.append(obj)
                    idx = end_idx
                except json.JSONDecodeError:
                    idx += 1

        # --- EXTRACTION LOGIC ---
        for item in items_to_process:
            try:
                actions = item.get("replayChatItemAction", {}).get("actions", [])
                
                if not actions:
                    continue

                action = actions[0]
                
                # Get Video Offset (The important part!)
                raw_offset = item.get("replayChatItemAction", {}).get("videoOffsetTimeMsec")
                final_offset_ms = parse_offset_to_ms(raw_offset)

                add_chat_item = action.get("addChatItemAction", {})
                renderer_item = add_chat_item.get("item", {})
                renderer = renderer_item.get("liveChatTextMessageRenderer")

                if not renderer:
                    continue

                # --- TIMESTAMP FALLBACK CALCULATION ---
                # If offset is missing or 0, we calculate it based on time passed since last message
                current_ts_us = int(renderer.get("timestampUsec", 0))
                
                if final_offset_ms is None or final_offset_ms == 0:
                    if last_known_real_timestamp_us > 0:
                        # Calculate time diff in microseconds -> convert to ms
                        diff_us = current_ts_us - last_known_real_timestamp_us
                        diff_ms = int(diff_us / 1000)
                        
                        # Add to previous offset (assuming sequential order)
                        final_offset_ms = last_known_calculated_offset_ms + diff_ms
                    else:
                        # First message fallback
                        final_offset_ms = 0
                
                # Update trackers for next iteration
                last_known_real_timestamp_us = current_ts_us
                last_known_calculated_offset_ms = final_offset_ms

                # Extract Author & Message
                author_name_obj = renderer.get("authorName", {})
                author = author_name_obj.get("simpleText", "Unknown Author")
                
                message_runs = renderer.get("message", {}).get("runs", [])
                message_text = "".join([run.get("text", "") for run in message_runs])

                messages.append({
                    "offsetMs": final_offset_ms,
                    "author": author,
                    "message": message_text
                })
                    
            except Exception as e:
                # Skip malformed items silently to process the rest
                continue

    except Exception as e:
        print(f"Critical Error processing file {file_path}: {e}")

    return messages

def process_folder(folder_path):
    if not os.path.exists(folder_path):
        print(f"Error: Folder '{folder_path}' does not exist.")
        return

    print(f"Scanning directory: {folder_path} (Video Player Mode)\n")

    for root, dirs, files in os.walk(folder_path):
        for filename in files:
            if filename.lower().endswith('.json'):
                full_path = os.path.join(root, filename)
                
                print(f"Processing: {full_path}")
                clean_data = extract_messages_for_player(full_path)

                if clean_data:
                    try:
                        with open(full_path, 'w', encoding='utf-8') as f:
                            json.dump(clean_data, f, indent=4, ensure_ascii=False)
                        print(f"   -> Formatted {len(clean_data)} messages for player sync.")
                    except IOError as e:
                        print(f"   -> Error writing file: {e}")
                else:
                    print(f"   -> No valid messages found, file may already be in correct format, skipping...")

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(script_dir)
    target_folder = os.path.join(parent_dir, "livechats")

    process_folder(target_folder)