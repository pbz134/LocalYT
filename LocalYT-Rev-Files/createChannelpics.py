import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import random

def generate_random_color():
    """Generate a random RGB color."""
    return (
        random.randint(0, 255),
        random.randint(0, 255),
        random.randint(0, 255)
    )

def find_system_font():
    """Find and return a system font that exists."""
    font_paths = [
        "C:/Windows/Fonts/Arial.ttf",
        "C:/Windows/Fonts/Arialbd.ttf",
        "C:/Windows/Fonts/arialb.ttf",
        "C:/Windows/Fonts/times.ttf",
        "C:/Windows/Fonts/timesbd.ttf"
    ]
    
    for font_path in font_paths:
        if os.path.exists(font_path):
            return font_path
    
    return None

def create_channel_pic(channel_name, output_path, size=160):
    """Create a profile picture for a channel."""
    bg_color = generate_random_color()
    img = Image.new('RGB', (size, size), color=bg_color)
    
    first_letter = channel_name[0].upper() if channel_name else "?"
    draw = ImageDraw.Draw(img)
    
    font_size = 100
    font_path = find_system_font()
    
    if font_path:
        try:
            if font_path.endswith('.ttc'):
                font = ImageFont.truetype(font_path, size=font_size, index=0)
            else:
                font = ImageFont.truetype(font_path, size=font_size)
        except Exception:
            font = ImageFont.load_default()
            font_size = 80
    else:
        font = ImageFont.load_default()
        font_size = 80
    
    x = size // 2
    y = size // 2
    
    draw.text((x, y), first_letter, font=font, fill=(255, 255, 255), anchor='mm')
    
    img.save(output_path, 'JPEG', quality=95)

def main():
    # --- DYNAMIC PATH RESOLUTION ---
    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent
    
    videos_path = root_dir / "videos"
    channelpic_path = root_dir / "channelpic"
    # -------------------------------

    videos_dir = Path(videos_path)
    channelpic_dir = Path(channelpic_path)
    
    # Ensure directories exist
    if not videos_dir.exists():
        print(f"Error: Videos directory not found at {videos_path}")
        return
    
    if not channelpic_dir.exists():
        channelpic_dir.mkdir(parents=True, exist_ok=True)
    
    # Get all channel subfolders
    channels = [item.name for item in videos_dir.iterdir() if item.is_dir()]
    
    if not channels:
        print("No channel folders found.")
        return

    # Identify missing pictures
    missing_pics = [
        channel for channel in channels 
        if not (channelpic_dir / f"{channel}.jpg").exists()
    ]

    # Create missing profile pictures silently
    created_count = 0
    error_count = 0
    
    for channel in missing_pics:
        output_file = channelpic_dir / f"{channel}.jpg"
        try:
            create_channel_pic(channel, output_file)
            created_count += 1
        except Exception as e:
            print(f"Error creating pic for {channel}: {e}")
            error_count += 1

    # Final Summary
    print(f"Profile Picture Update Complete:")
    print(f"  Total Channels: {len(channels)}")
    print(f"  New Images Created: {created_count}")
    
    if error_count > 0:
        print(f"  Errors: {error_count}")

if __name__ == "__main__":
    main()