import re
from argparse import ArgumentParser


import argparse
import os
from simplesrt import process_srt


# nice progressbar via tqdm
try:
    from tqdm import tqdm

    TQDM_INSTALLED = True
except ModuleNotFoundError:
    TQDM_INSTALLED = False

def main():
    parser: ArgumentParser = argparse.ArgumentParser(description="fix duplicate lines in youtube auto generated subtitles (supports .srt and .vtt)")
    parser.add_argument("input", nargs="?", help="Input subtitle file.")
    parser.add_argument("-o", "--output", help="Output subtitle file.")
    parser.add_argument("-idir", "--input-directory", help="Input directory containing subtitle files.")
    parser.add_argument("-odir", "--output-directory", help='Output directory for processed subtitle files.')
    args = parser.parse_args()
    input_directory = args.input_directory
    output_directory = args.output_directory
    output_file = args.output
    if output_file and not input_directory:
        output_directory = None



    if input_directory:
        if not os.path.isdir(input_directory):
            print(f"Input directory '{input_directory}' does not exist or is not accessible.")
            return

        if not output_directory:
            output_directory = input_directory

        # Gather all files recursively first to allow accurate progress bar counting
        all_files = []
        for root, _, files in os.walk(input_directory):
            for file in files:
                if file.endswith(".srt") or file.endswith(".vtt"):
                    all_files.append((root, file))
        
        filecount = len(all_files)
        counter = 1

        if not TQDM_INSTALLED:
            for root, file in all_files:
                deciles = int(counter / filecount * 20) if filecount > 0 else 0
                print(f"processing subtitle files:|{'█' * deciles}{' ' * (20 - deciles)}| {counter}/{filecount}", end='\r')
                if counter == filecount:
                    print("\n", end="\r")
                counter += 1

                file_path = os.path.join(root, file)
                
                # Calculate the relative path to preserve subfolder structure
                rel_dir = os.path.relpath(root, input_directory)
                out_dir = os.path.join(output_directory, rel_dir)
                
                # Ensure the output sub-directory exists
                os.makedirs(out_dir, exist_ok=True)
                
                base_name = file.rsplit('.', 1)[0]
                ext = '.vtt' # Output will always be VTT format now
                new_file_path = os.path.join(out_dir, base_name + ext) # Removed ".fixed" to overwrite naturally
                process_srt(file_path, new_file_path)
        else:
            for root, file in tqdm(all_files, desc="Processing subtitle files", unit="file",
                             bar_format='{l_bar}{bar:10}{r_bar}{bar:-10b}'):
                
                file_path = os.path.join(root, file)
                
                # Calculate the relative path to preserve subfolder structure
                rel_dir = os.path.relpath(root, input_directory)
                out_dir = os.path.join(output_directory, rel_dir)
                
                # Ensure the output sub-directory exists
                os.makedirs(out_dir, exist_ok=True)
                
                base_name = file.rsplit('.', 1)[0]
                ext = '.vtt' # Output will always be VTT format now
                new_file_path = os.path.join(out_dir, base_name + ext) # Removed ".fixed" to overwrite naturally
                process_srt(file_path, new_file_path)
    else:
        file_path = str(args.input)
        if not file_path or not os.path.isfile(file_path):
            print(f"Input file '{file_path}' does not exist or is not accessible.")
            return

        # Default output extension logic for single file
        if not output_file and not output_directory:
            base_name = file_path.rsplit('.', 1)[0]
            new_file_path = base_name + ".fixed.vtt"
        elif output_file and os.path.isdir(output_file):
            base_name = os.path.basename(file_path).rsplit('.', 1)[0]
            new_file_path = os.path.join(output_file, base_name + ".fixed.vtt")
        elif output_directory:
            base_name = os.path.basename(file_path).rsplit('.', 1)[0]
            new_file_path = os.path.join(output_directory, base_name + ".fixed.vtt")
        else:
            new_file_path = output_file

        process_srt(file_path, new_file_path)



if __name__ == "__main__":
    main()