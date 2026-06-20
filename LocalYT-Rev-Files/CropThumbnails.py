#!/usr/bin/env python3
"""
Thumbnail Black Bar Remover - Scans for thumbnails with black bars and zooms in to remove them.
Overwrites files directly without creating backups.
"""

import os
import argparse
from pathlib import Path
from PIL import Image
import numpy as np
from concurrent.futures import ThreadPoolExecutor, as_completed
import sys

def find_content_boundaries(image, threshold=30):
    """
    Find the actual content boundaries by detecting where black bars end.
    
    Args:
        image: PIL Image object
        threshold: Pixel value threshold for considering a pixel as black
    
    Returns:
        tuple: (left, top, right, bottom) boundaries of the content
    """
    img_array = np.array(image.convert('RGB'))
    height, width = img_array.shape[:2]
    
    # Find left boundary (scan from left to right)
    left_boundary = 0
    for x in range(width):
        # Check if this column has any non-black pixels
        column = img_array[:, x]
        # Check if any pixel in column is not black (above threshold)
        non_black = np.any(np.any(column > threshold, axis=1))
        if non_black:
            left_boundary = x
            break
    
    # Find right boundary (scan from right to left)
    right_boundary = width
    for x in range(width - 1, -1, -1):
        column = img_array[:, x]
        non_black = np.any(np.any(column > threshold, axis=1))
        if non_black:
            right_boundary = x + 1
            break
    
    # Find top boundary (scan from top to bottom)
    top_boundary = 0
    for y in range(height):
        row = img_array[y, :]
        non_black = np.any(np.any(row > threshold, axis=1))
        if non_black:
            top_boundary = y
            break
    
    # Find bottom boundary (scan from bottom to top)
    bottom_boundary = height
    for y in range(height - 1, -1, -1):
        row = img_array[y, :]
        non_black = np.any(np.any(row > threshold, axis=1))
        if non_black:
            bottom_boundary = y + 1
            break
    
    return left_boundary, top_boundary, right_boundary, bottom_boundary

def detect_black_bars(image, threshold=30, sample_ratio=0.1):
    """
    Detect if the image has black bars on any side.
    
    Args:
        image: PIL Image object
        threshold: Pixel value threshold for considering a pixel as black (0-255)
        sample_ratio: Ratio of width/height to sample for checking black bars
    
    Returns:
        tuple: (has_left_bar, has_right_bar, has_top_bar, has_bottom_bar)
    """
    # Convert to numpy array for faster processing
    img_array = np.array(image.convert('RGB'))
    height, width = img_array.shape[:2]
    
    # Calculate sample step
    sample_step_x = max(1, int(width * (1 - sample_ratio)))
    sample_step_y = max(1, int(height * (1 - sample_ratio)))
    x_indices = range(0, width, sample_step_x)
    y_indices = range(0, height, sample_step_y)
    
    # Check left side (first 10% of width)
    left_check_width = max(1, width // 10)
    left_black_count = 0
    left_pixel_count = 0
    
    for x in range(left_check_width):
        for y in y_indices:
            if x < width and y < height:
                r, g, b = img_array[y, x]
                if r < threshold and g < threshold and b < threshold:
                    left_black_count += 1
                left_pixel_count += 1
    
    # Check right side (last 10% of width)
    right_check_width = max(1, width // 10)
    right_black_count = 0
    right_pixel_count = 0
    
    for x in range(width - right_check_width, width):
        for y in y_indices:
            if 0 <= x < width and y < height:
                r, g, b = img_array[y, x]
                if r < threshold and g < threshold and b < threshold:
                    right_black_count += 1
                right_pixel_count += 1
    
    # Check top side (first 10% of height)
    top_check_height = max(1, height // 10)
    top_black_count = 0
    top_pixel_count = 0
    
    for y in range(top_check_height):
        for x in x_indices:
            if x < width and y < height:
                r, g, b = img_array[y, x]
                if r < threshold and g < threshold and b < threshold:
                    top_black_count += 1
                top_pixel_count += 1
    
    # Check bottom side (last 10% of height)
    bottom_check_height = max(1, height // 10)
    bottom_black_count = 0
    bottom_pixel_count = 0
    
    for y in range(height - bottom_check_height, height):
        for x in x_indices:
            if x < width and 0 <= y < height:
                r, g, b = img_array[y, x]
                if r < threshold and g < threshold and b < threshold:
                    bottom_black_count += 1
                bottom_pixel_count += 1
    
    # Calculate black pixel ratios
    left_black_ratio = left_black_count / left_pixel_count if left_pixel_count > 0 else 0
    right_black_ratio = right_black_count / right_pixel_count if right_pixel_count > 0 else 0
    top_black_ratio = top_black_count / top_pixel_count if top_pixel_count > 0 else 0
    bottom_black_ratio = bottom_black_count / bottom_pixel_count if bottom_pixel_count > 0 else 0
    
    # Determine if bars exist (at least 70% black pixels in the checked region)
    has_left_bar = left_black_ratio > 0.7
    has_right_bar = right_black_ratio > 0.7
    has_top_bar = top_black_ratio > 0.7
    has_bottom_bar = bottom_black_ratio > 0.7
    
    return has_left_bar, has_right_bar, has_top_bar, has_bottom_bar

def zoom_to_16_9(image, threshold=30):
    """
    Remove black bars and zoom in to achieve 16:9 aspect ratio.
    
    Args:
        image: PIL Image object
        threshold: Pixel value threshold for black detection
    
    Returns:
        PIL Image object zoomed to 16:9 without black bars
    """
    width, height = image.size
    
    # Find the actual content boundaries
    left, top, right, bottom = find_content_boundaries(image, threshold)
    
    # Crop out black bars
    content_width = right - left
    content_height = bottom - top
    
    # If content is too small or boundaries are invalid, use the whole image
    if content_width <= 0 or content_height <= 0 or content_width < width * 0.5 or content_height < height * 0.5:
        cropped = image
    else:
        # Crop to content
        cropped = image.crop((left, top, right, bottom))
    
    cropped_width, cropped_height = cropped.size
    
    # Now ensure 16:9 aspect ratio
    target_ratio = 16 / 9
    current_ratio = cropped_width / cropped_height
    
    # If already close to 16:9, return cropped
    if abs(current_ratio - target_ratio) < 0.01:
        return cropped
    
    if current_ratio > target_ratio:
        # Too wide - crop from left and right
        target_width = int(cropped_height * target_ratio)
        total_remove = cropped_width - target_width
        remove_left = total_remove // 2
        remove_right = total_remove - remove_left
        return cropped.crop((remove_left, 0, cropped_width - remove_right, cropped_height))
    else:
        # Too tall - crop from top and bottom
        target_height = int(cropped_width / target_ratio)
        total_remove = cropped_height - target_height
        remove_top = total_remove // 2
        remove_bottom = total_remove - remove_top
        return cropped.crop((0, remove_top, cropped_width, cropped_height - remove_bottom))

def process_image(filepath, threshold=30, dry_run=False, min_size=100):
    """
    Process a single image file - detect black bars and zoom in to remove them.
    
    Args:
        filepath: Path to the image file
        threshold: Pixel value threshold for black detection
        dry_run: If True, only simulate the operation
        min_size: Minimum image dimension to process
    
    Returns:
        dict: Result information
    """
    result = {
        'path': str(filepath),
        'status': 'skipped',
        'message': '',
        'before': None,
        'after': None
    }
    
    try:
        # Open image
        with Image.open(filepath) as img:
            dimensions = img.size
            width, height = dimensions
            
            # Skip very small images
            if width < min_size or height < min_size:
                result['message'] = f"Image too small ({width}x{height})"
                return result
            
            # Detect black bars
            has_left, has_right, has_top, has_bottom = detect_black_bars(img, threshold)
            
            bar_types = []
            if has_left:
                bar_types.append("left")
            if has_right:
                bar_types.append("right")
            if has_top:
                bar_types.append("top")
            if has_bottom:
                bar_types.append("bottom")
            
            # Check if there are any black bars
            has_any_bar = has_left or has_right or has_top or has_bottom
            
            if not has_any_bar:
                # Check if aspect ratio is already 16:9
                aspect_ratio = width / height
                target_ratio = 16 / 9
                if abs(aspect_ratio - target_ratio) < 0.02:
                    result['message'] = f"No black bars and already 16:9 ({width}x{height})"
                    return result
            
            if dry_run:
                result['status'] = 'would_process'
                result['message'] = f"Would process {width}x{height} with {', '.join(bar_types) if bar_types else 'no'} bars"
                return result
            
            # Process the image - remove black bars and make 16:9
            processed_image = zoom_to_16_9(img, threshold)
            
            # Check if any changes were made
            if processed_image.size == dimensions:
                result['message'] = f"No changes made to {width}x{height}"
                return result
            
            # Save the processed image (overwrite)
            processed_image.save(filepath, quality=95, optimize=True)
            
            new_dimensions = processed_image.size
            result['status'] = 'processed'
            result['message'] = f"{width}x{height} with {', '.join(bar_types) if bar_types else 'no'} bars -> {new_dimensions[0]}x{new_dimensions[1]}"
            result['before'] = dimensions
            result['after'] = new_dimensions
            
            return result
            
    except Exception as e:
        result['status'] = 'error'
        result['message'] = f"Error: {str(e)}"
    
    return result

def main():
    parser = argparse.ArgumentParser(
        description='Remove black bars from thumbnails by zooming in (overwrites files)'
    )
    parser.add_argument('directory', nargs='?', default='./thumbnails',
                       help='Root directory to scan (default: ./thumbnails)')
    parser.add_argument('--dry-run', '-n', action='store_true',
                       help='Simulate operations without actually modifying files')
    parser.add_argument('--threshold', '-t', type=int, default=30,
                       help='Pixel value threshold for black detection (0-255, default: 30)')
    parser.add_argument('--threads', '-j', type=int, default=4,
                       help='Number of threads for parallel processing (default: 4)')
    parser.add_argument('--recursive', '-r', action='store_true', default=True,
                       help='Scan recursively (default: True)')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Print detailed information about each file')
    parser.add_argument('--min-size', type=int, default=100,
                       help='Minimum image dimension to process (default: 100)')
    
    args = parser.parse_args()
    
    # Validate directory
    root_dir = Path(args.directory)
    if not root_dir.exists():
        print(f"Error: Directory '{root_dir}' does not exist")
        sys.exit(1)
    
    if not root_dir.is_dir():
        print(f"Error: '{root_dir}' is not a directory")
        sys.exit(1)
    
    # Find all image files
    image_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp', '.gif'}
    
    if args.recursive:
        files = list(root_dir.rglob('*'))
    else:
        files = list(root_dir.glob('*'))
    
    # Filter to only image files
    image_files = [f for f in files if f.is_file() and f.suffix.lower() in image_extensions]
    
    total_files = len(image_files)
    
    if total_files == 0:
        print("No image files found to scan.")
        return
    
    print(f"Scanning {total_files} image files for black bars...")
    if args.dry_run:
        print("⚠️  DRY RUN MODE - No files will be modified")
    else:
        print("⚠️  WARNING: Files will be OVERWRITTEN without backups!")
    
    # Process files
    processed_count = 0
    skipped_count = 0
    error_count = 0
    results = []
    
    # Create a thread pool
    with ThreadPoolExecutor(max_workers=args.threads) as executor:
        # Submit all tasks
        future_to_file = {
            executor.submit(process_image, f, args.threshold, args.dry_run, args.min_size): f 
            for f in image_files
        }
        
        completed = 0
        
        for future in as_completed(future_to_file):
            filepath = future_to_file[future]
            completed += 1
            
            try:
                result = future.result()
                results.append(result)
                
                if result['status'] == 'processed':
                    processed_count += 1
                    if args.verbose:
                        rel_path = filepath.relative_to(root_dir)
                        print(f"✓ Processed: {rel_path} - {result['message']}")
                elif result['status'] == 'would_process':
                    if args.verbose:
                        rel_path = filepath.relative_to(root_dir)
                        print(f"ℹ [DRY RUN] Would process: {rel_path} - {result['message']}")
                elif result['status'] == 'error':
                    error_count += 1
                    if args.verbose:
                        rel_path = filepath.relative_to(root_dir)
                        print(f"✗ Error: {rel_path} - {result['message']}")
                else:
                    skipped_count += 1
                    if args.verbose and result['message']:
                        rel_path = filepath.relative_to(root_dir)
                        print(f"  Skipped: {rel_path} - {result['message']}")
                
                # Update progress
                status_msg = f"Processing file #{completed}/{total_files}... "
                if args.dry_run:
                    status_msg += f"Would process: {processed_count}, Skipped: {skipped_count}"
                else:
                    status_msg += f"Processed: {processed_count}, Skipped: {skipped_count}"
                if error_count:
                    status_msg += f", Errors: {error_count}"
                sys.stdout.write(status_msg.ljust(80) + "\r")
                sys.stdout.flush()
                
            except Exception as e:
                error_count += 1
                print(f"\nError processing {filepath}: {e}")
    
    # Clear line
    sys.stdout.write(" " * 80 + "\r")
    sys.stdout.flush()
    
    # Print summary
    print("\n" + "=" * 70)
    if args.dry_run:
        print("DRY RUN SUMMARY:")
    else:
        print("PROCESSING SUMMARY:")
    print(f"  Total files scanned:    {total_files}")
    print(f"  Files processed:        {processed_count}")
    print(f"  Files skipped:          {skipped_count}")
    print(f"  Errors:                 {error_count}")
    
    if processed_count > 0:
        print(f"\nSample of processed files (first 10):")
        processed_results = [r for r in results if r['status'] == 'processed' or r['status'] == 'would_process']
        for result in processed_results[:10]:
            rel_path = Path(result['path']).relative_to(root_dir)
            if result['status'] == 'processed':
                print(f"  • {rel_path}: {result['message']}")
            else:
                print(f"  • [DRY RUN] {rel_path}: {result['message']}")
        if len(processed_results) > 10:
            print(f"  ... and {len(processed_results) - 10} more")
    
    if not args.dry_run and processed_count > 0:
        print(f"\n✅ Successfully processed {processed_count} thumbnails")
    elif args.dry_run and processed_count > 0:
        print(f"\nℹ  Dry run complete - would have processed {processed_count} thumbnails")
        print(f"   Run without --dry-run to actually process them")
    
    if error_count > 0:
        print(f"\n⚠️  {error_count} errors occurred")
        error_results = [r for r in results if r['status'] == 'error']
        for result in error_results[:5]:
            rel_path = Path(result['path']).relative_to(root_dir)
            print(f"  • {rel_path}: {result['message']}")
        if len(error_results) > 5:
            print(f"  ... and {len(error_results) - 5} more")
    
    print("=" * 70)
    print("Done!")

if __name__ == "__main__":
    main()