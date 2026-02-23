import os

def find_mp4_files(directory):
    mp4_files = []
    
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(".mp4"):
                # Get the full path of the MP4 file
                mp4_full_path = os.path.join(root, file)
                
                # Get the relative path from the input directory
                relative_path = os.path.relpath(mp4_full_path, directory)
                
                # Check if a .txt file with the same name already exists
                txt_file_name = os.path.splitext(file)[0] + ".txt"
                txt_file_path = os.path.join(root, txt_file_name)
                
                # Only add the MP4 if no corresponding .txt file exists
                if not os.path.exists(txt_file_path):
                    mp4_files.append(relative_path)
                else:
                    print(f"Skipping '{relative_path}' - .txt file already exists")
    
    return mp4_files

def write_to_txt(file_list, output_file):
    # Fixed: Added encoding='utf-8' to handle Unicode characters
    with open(output_file, 'w', encoding='utf-8') as f:
        for file_path in file_list:
            f.write(f"{file_path}\n")

def main():
    # Set input directory to ../videos (one level back)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(script_dir)
    input_folder = os.path.join(parent_dir, "videos")
    
    # Set output file path to be in the same directory as this script
    output_txt = os.path.join(script_dir, "video_list.txt")
    
    if not os.path.isdir(input_folder):
        print(f"The directory '{input_folder}' does not exist.")
        return

    mp4_files = find_mp4_files(input_folder)
    write_to_txt(mp4_files, output_txt)

    print(f"Found {len(mp4_files)} .mp4 files without existing .txt files.")
    print(f"List saved to '{output_txt}'.")
    print(f"Input directory: {input_folder}")
    
    # Show some examples if files were found
    if mp4_files:
        print("\nExample files to be processed:")
        for i, file in enumerate(mp4_files[:5]):  # Show first 5 files
            print(f"  {file}")
        if len(mp4_files) > 5:
            print(f"  ... and {len(mp4_files) - 5} more")

if __name__ == "__main__":
    main()