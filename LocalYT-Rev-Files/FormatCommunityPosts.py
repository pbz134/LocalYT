import os
import json
import shutil

def organize_files():
    # 1. Dynamic Path Calculation
    script_location = os.path.dirname(os.path.abspath(__file__))
    root_folder = os.path.join(os.path.dirname(script_location), "channelposts")

    if not os.path.isdir(root_folder):
        print(f"Error: The directory '{root_folder}' does not exist.")
        return

    print(f"Scanning '{root_folder}'...\n")

    files_processed = 0
    valid_chars = (" ", "_", "-", "(", ")", ".", ",", "'", "!", "@", "#", "$", "%", "^", "&", "+", "=", "[", "]", "{", "}")

    def find_file_fuzzy(target_filename, search_dir):
        exact_path = os.path.join(search_dir, target_filename)
        if os.path.exists(exact_path):
            return exact_path
        
        base_name, ext = os.path.splitext(target_filename)
        if os.path.isdir(search_dir):
            for f in os.listdir(search_dir):
                if f.startswith(base_name) and f.endswith(ext):
                    return os.path.join(search_dir, f)
        return None

    # 2. Recursively scan
    for current_root, dirs, files in os.walk(root_folder):
        for file in files:
            if file.endswith(".json"):
                json_path = os.path.join(current_root, file)
                
                try:
                    with open(json_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)

                    # --- EXTRACT AUTHOR ---
                    uploader_name = None
                    if isinstance(data, list) and len(data) > 0:
                        uploader_name = data[0].get("author") or data[0].get("uploader")
                    elif isinstance(data, dict):
                        uploader_name = data.get("author") or data.get("uploader")
                    
                    if not uploader_name:
                        continue

                    safe_uploader_name = "".join(c if c.isalnum() or c in valid_chars else "_" for c in uploader_name)
                    dest_folder = os.path.join(root_folder, safe_uploader_name)
                    os.makedirs(dest_folder, exist_ok=True)

                    # --- A. HANDLE JSON ---
                    dest_json_path = os.path.join(dest_folder, "Community_Posts.json")

                    if os.path.abspath(json_path) != os.path.abspath(dest_json_path):
                        if os.path.exists(dest_json_path):
                            base, ext = os.path.splitext("Community_Posts.json")
                            counter = 1
                            while os.path.exists(dest_json_path):
                                dest_json_path = os.path.join(dest_folder, f"{base}_{counter}{ext}")
                                counter += 1
                        shutil.move(json_path, dest_json_path)

                    # --- B. HANDLE IMAGES (Silent Mode) ---
                    items_to_scan = data if isinstance(data, list) else [data]
                    
                    for item in items_to_scan:
                        images = item.get("images", [])
                        if not isinstance(images, list): 
                            continue

                        for img in images:
                            filename = img.get("file_name")
                            if not filename:
                                lp = img.get("local_path")
                                if lp: filename = os.path.basename(lp)
                            
                            if not filename: continue

                            final_dest_path = os.path.join(dest_folder, filename)
                            
                            # Skip if already exists with correct name
                            if os.path.exists(final_dest_path):
                                continue

                            source_file_path = None
                            
                            # 1. Fuzzy Search Current Folder
                            found = find_file_fuzzy(filename, current_root)
                            if found: source_file_path = found

                            # 2. Deep Search
                            elif filename.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.gif')):
                                for r, d, fs in os.walk(root_folder):
                                    found_in_sub = find_file_fuzzy(filename, r)
                                    if found_in_sub:
                                        source_file_path = found_in_sub
                                        break 

                            # Execute Move
                            if source_file_path and os.path.exists(source_file_path):
                                safe_dest = final_dest_path
                                counter = 1
                                while os.path.exists(safe_dest):
                                     base, ext = os.path.splitext(filename)
                                     safe_dest = os.path.join(dest_folder, f"{base}_{counter}{ext}")
                                     counter += 1
                                shutil.move(source_file_path, safe_dest)

                    # --- SUCCESS MESSAGE ---
                    print(f"Community posts for {safe_uploader_name} successfully organized")
                    files_processed += 1

                except Exception as e:
                    print(f"[Error] Failed to process {file}: {e}")


if __name__ == "__main__":
    organize_files()