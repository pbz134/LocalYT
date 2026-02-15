from PIL import Image, ImageOps
import os

def crop_to_16_9(image):
    width, height = image.size
    target_aspect = 16 / 9
    current_aspect = width / height

    if current_aspect == target_aspect:
        return image

    if current_aspect > target_aspect:
        new_width = int(height * target_aspect)
        left = (width - new_width) // 2
        right = left + new_width
        return image.crop((left, 0, right, height))
    else:
        new_height = int(width / target_aspect)
        top = (height - new_height) // 2
        bottom = top + new_height
        return image.crop((0, top, width, bottom))

def add_border_to_1_1(image):
    width, height = image.size
    if width == height:
        new_width = int(height * 16 / 9)
        border = (new_width - width) // 2
        return ImageOps.expand(image, border=(border, 0), fill="#0f0f0f")
    return image

def process_images(folder_path):
    for root, _, files in os.walk(folder_path):
        for file in files:
            if file.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.gif')):
                file_path = os.path.join(root, file)
                image = Image.open(file_path)

                # Crop to 16:9 if not already 16:9
                image = crop_to_16_9(image)

                # Add border if the image is 1:1
                image = add_border_to_1_1(image)

                # Save the processed image, replacing the original
                image.save(file_path)
                print(f"Processed and replaced: {file_path}")

# Example usage
folder_path = 'path/to/your/image/folder'
process_images(folder_path)
