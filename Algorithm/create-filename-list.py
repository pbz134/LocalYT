import os
import argparse
import sys

def find_media_files(directory, mode='untagged', verbose=False):
    media_files = []
    media_extensions = [".mp4", ".mkv", ".mp3"]
    
    for root, dirs, files in os.walk(directory):
        for file in files:
            # Check if file has one of the media extensions
            if any(file.lower().endswith(ext) for ext in media_extensions):
                # Get the full path of the media file
                media_full_path = os.path.join(root, file)
                
                # Get the relative path from the input directory
                relative_path = os.path.relpath(media_full_path, directory)
                
                # Check if a .txt file with the same name exists
                txt_file_name = os.path.splitext(file)[0] + ".txt"
                txt_file_path = os.path.join(root, txt_file_name)
                txt_exists = os.path.exists(txt_file_path)
                
                if mode == 'all':
                    # Add all media files regardless of .txt files
                    media_files.append(relative_path)
                    if verbose:
                        print(f"Adding '{relative_path}'")
                        
                elif mode == 'uncategorized':
                    # ONLY add .mp4 files that have "Uncategorized" as a tag
                    if file.lower().endswith('.mp4') and txt_exists:
                        try:
                            with open(txt_file_path, 'r', encoding='utf-8') as f:
                                content = f.read().strip()
                                # Split by comma and clean up whitespace
                                tags = [tag.strip() for tag in content.split(',')]
                                if 'Uncategorized' in tags:
                                    media_files.append(relative_path)
                                    if verbose:
                                        print(f"Adding '{relative_path}' - contains 'Uncategorized' tag")
                                elif verbose:
                                    print(f"Skipping '{relative_path}' - does not have 'Uncategorized' tag")
                        except Exception as e:
                            if verbose:
                                print(f"Skipping '{relative_path}' - error reading .txt file: {e}")
                    elif verbose:
                        if not file.lower().endswith('.mp4'):
                            print(f"Skipping '{relative_path}' - not an .mp4 file")
                        else:
                            print(f"Skipping '{relative_path}' - no .txt file found")
                            
                else:  # mode == 'untagged' (default)
                    # Only add the media file if no corresponding .txt file exists
                    if not txt_exists:
                        media_files.append(relative_path)
                        if verbose:
                            print(f"Adding '{relative_path}' - no .txt file found")
                    elif verbose:
                        print(f"Skipping '{relative_path}' - .txt file already exists")
    
    return media_files

def write_to_txt(file_list, output_file):
    # Fixed: Added encoding='utf-8' to handle Unicode characters
    with open(output_file, 'w', encoding='utf-8') as f:
        for file_path in file_list:
            f.write(f"{file_path}\n")

def parse_arguments():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(
        description='Find media files (.mp4, .mkv, .mp3) and generate a list.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                           # Interactive mode (asks for choice)
  %(prog)s --all                     # Include all media files
  %(prog)s --untagged                # Include only untagged files
  %(prog)s --uncategorized           # Include only .mp4 files tagged as "Uncategorized"
  %(prog)s --all --output mylist.txt # Custom output file
  %(prog)s --all --input /path/to/videos  # Custom input directory
  %(prog)s --all --verbose           # Verbose output
        """
    )
    
    # Create mutually exclusive group for mode selection
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument('--all', action='store_true', 
                          help='Include ALL media files (no filtering)')
    mode_group.add_argument('--untagged', action='store_true', 
                          help='Include ONLY untagged files (no companion .txt file)')
    mode_group.add_argument('--uncategorized', action='store_true', 
                          help='Include ONLY .mp4 files that have "Uncategorized" as a tag')
    
    # Other arguments
    parser.add_argument('--input', '-i', type=str, 
                       help='Input directory (default: ../videos relative to script)')
    parser.add_argument('--output', '-o', type=str, 
                       help='Output file path (default: media_list.txt in script directory)')
    parser.add_argument('--verbose', '-v', action='store_true', 
                       help='Print verbose output')
    
    return parser.parse_args()

def main():
    # Parse command line arguments
    args = parse_arguments()
    
    # Set input directory
    if args.input:
        input_folder = args.input
    else:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        parent_dir = os.path.dirname(script_dir)
        input_folder = os.path.join(parent_dir, "videos")
    
    # Set output file path
    if args.output:
        output_txt = args.output
    else:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        output_txt = os.path.join(script_dir, "media_list.txt")
    
    # Check if input directory exists
    if not os.path.isdir(input_folder):
        print(f"Error: The directory '{input_folder}' does not exist.", file=sys.stderr)
        sys.exit(1)
    
    # Determine mode
    if args.all:
        mode = 'all'
        print("Mode: Including ALL media files")
    elif args.uncategorized:
        mode = 'uncategorized'
        print("Mode: Including ONLY .mp4 files tagged as 'Uncategorized'")
    elif args.untagged:
        mode = 'untagged'
        print("Mode: Including ONLY untagged files")
    else:
        # Interactive mode if no mode specified
        print("\nHow would you like to process the files?")
        print("1: Include ALL media files (.mp4, .mkv, .mp3)")
        print("2: Include ONLY untagged files (files without a .txt companion)")
        print("3: Include ONLY .mp4 files tagged as 'Uncategorized'")
        
        while True:
            choice = input("Enter your choice (1, 2, or 3): ").strip()
            if choice == "1":
                mode = 'all'
                print("Mode: Including ALL media files")
                break
            elif choice == "2":
                mode = 'untagged'
                print("Mode: Including ONLY untagged files")
                break
            elif choice == "3":
                mode = 'uncategorized'
                print("Mode: Including ONLY .mp4 files tagged as 'Uncategorized'")
                break
            else:
                print("Invalid choice. Please enter 1, 2, or 3.")
    
    # Find media files
    media_files = find_media_files(input_folder, mode, args.verbose)
    
    # Write to output file
    write_to_txt(media_files, output_txt)
    
    # Print summary
    print(f"\nFound {len(media_files)} media files.")
    print(f"List saved to: {output_txt}")
    print(f"Input directory: {input_folder}")
    
    # Show examples if verbose mode is on or if files were found and we're in interactive mode
    if media_files and (args.verbose or not (args.all or args.untagged or args.uncategorized)):
        print("\nExample files in the list:")
        for i, file in enumerate(media_files[:5]):
            print(f"  {file}")
        if len(media_files) > 5:
            print(f"  ... and {len(media_files) - 5} more")

if __name__ == "__main__":
    main()