import sys
import os
import glob
import random
import subprocess
import locale
import json
from datetime import datetime, timezone
from PyQt5.QtWidgets import (QApplication, QMainWindow, QVBoxLayout, QHBoxLayout, 
                             QWidget, QPushButton, QListWidget, QListWidgetItem, QLabel, QProgressBar, 
                             QMessageBox, QFileDialog, QLineEdit, QInputDialog)
from PyQt5.QtCore import Qt, QThread, pyqtSignal

# --- Configuration ---
YT_DLP_PATH = "yt-dlp.exe"
# ---------------------

def get_base_output_dir():
    """
    Get the parent directory of the script's location.
    If the script is at LocalYT\yt-dlp\script.py, returns LocalYT\
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(script_dir)
    return parent_dir

def sanitize_filename(name):
    """
    Remove or replace characters that are invalid in Windows filenames.
    """
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        name = name.replace(char, '_')
    return name.strip()

class WorkerThread(QThread):
    """
    Background thread to handle yt-dlp processing without freezing the GUI.
    """
    progress_update = pyqtSignal(int, int, str)
    log_message = pyqtSignal(str)
    finished_processing = pyqtSignal()

    def __init__(self, file_queue):
        super().__init__()
        self.file_queue = file_queue
        self.is_running = True
        self.base_output_dir = get_base_output_dir()

    def run(self):
        total_files = len(self.file_queue)
        
        for file_index, job in enumerate(self.file_queue):
            if not self.is_running:
                break

            txt_file = job['path']
            output_name = job['output']

            if not output_name:
                filename = os.path.basename(txt_file)
                output_name = filename.replace("_videos.txt", "").replace("_video.txt", "")
                if not output_name:
                    output_name = os.path.splitext(filename)[0]

            self.log_message.emit(f"\n{'='*10} Processing: {os.path.basename(txt_file)} {'='*10}")
            self.log_message.emit(f"Output Folder Name: {output_name}")

            try:
                self.process_file(txt_file, output_name, file_index, total_files)
            except Exception as e:
                self.log_message.emit(f"Error processing {txt_file}: {str(e)}")

        self.finished_processing.emit()

    def stop(self):
        self.is_running = False

    def run_yt_dlp(self, args, url, action_desc):
        """Helper to run yt-dlp commands and capture output."""
        cmd = [YT_DLP_PATH] + args + [url]
        self.log_message.emit(f"  {action_desc}...")
        
        try:
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            
            # FIX: Use the system's preferred encoding (e.g., cp1252 or cp850)
            # instead of forcing UTF-8. This matches how yt-dlp outputs text on Windows.
            sys_encoding = locale.getpreferredencoding(False)
            
            result = subprocess.run(
                cmd, 
                capture_output=True, 
                text=True, 
                encoding=sys_encoding, 
                errors='replace', # Replace errors if they still occur
                startupinfo=startupinfo
            )
            return result.stdout.strip()
        except FileNotFoundError:
            self.log_message.emit(f"ERROR: {YT_DLP_PATH} not found.")
            return None

    def process_file(self, txt_file, output_name, file_index, total_files):
        if not os.path.exists(txt_file):
            self.log_message.emit(f"File not found: {txt_file}")
            return

        # Read input file as UTF-8 (standard for text files usually)
        with open(txt_file, 'r', encoding='utf-8', errors='replace') as f:
            urls = [line.strip() for line in f if line.strip()]

        total_urls = len(urls)
        self.log_message.emit(f"Found {total_urls} URLs.")

        # Create directories in the parent folder (one level above script)
        os.makedirs(os.path.join(self.base_output_dir, "thumbnails"), exist_ok=True)
        os.makedirs(os.path.join(self.base_output_dir, "descriptions"), exist_ok=True)
        os.makedirs(os.path.join(self.base_output_dir, "videostats"), exist_ok=True)
        os.makedirs(os.path.join(self.base_output_dir, "viewcounts"), exist_ok=True)
        os.makedirs(os.path.join(self.base_output_dir, "filedates"), exist_ok=True)
        os.makedirs(os.path.join(self.base_output_dir, "comments"), exist_ok=True) # Added for comments

        common_args = ["--cookies-from-browser", "firefox", "--js-runtimes", "node", "--no-warnings"]

        for url_index, url in enumerate(urls):
            if not self.is_running:
                return

            current_step = (file_index * total_urls) + (url_index + 1)
            total_steps = total_files * total_urls
            
            self.progress_update.emit(current_step, total_steps, f"Processing {url[:50]}...")

            # 1. Get Safe Title
            title_args = ["--print", "filename", "-o", "%(title)s"]
            safe_title = self.run_yt_dlp(common_args + title_args, url, "Fetching Title")
            
            if not safe_title:
                self.log_message.emit(f"  Skipping {url} (could not fetch title)")
                continue
            
            if safe_title.endswith(".mp4"):
                safe_title = safe_title[:-4]
            
            safe_title = sanitize_filename(safe_title)

            # 2. Process Metadata
            self.fetch_upload_date(url, safe_title, output_name, common_args)
            self.fetch_views(url, safe_title, output_name, common_args)
            self.fetch_likes(url, safe_title, output_name, common_args)
            self.fetch_thumbnail(url, safe_title, output_name, common_args)
            self.fetch_description(url, safe_title, output_name, common_args)
            
            # 3. Process Comments (New Feature)
            self.fetch_comments(url, safe_title, output_name, common_args)

    def fetch_upload_date(self, url, safe_title, out_folder, common_args):
        out_dir = os.path.join(self.base_output_dir, "filedates", out_folder)
        os.makedirs(out_dir, exist_ok=True)
        
        args = ["--print", "%(upload_date)s"]
        date_str = self.run_yt_dlp(common_args + args, url, "Fetching Date")
        
        if date_str and len(date_str) == 8:
            formatted = f"{date_str[6:8]}.{date_str[4:6]}.{date_str[0:4]}"
            filepath = os.path.join(out_dir, f"{safe_title}.txt")
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(formatted)
        else:
            self.log_message.emit("    No upload date found.")

    def fetch_views(self, url, safe_title, out_folder, common_args):
        out_dir = os.path.join(self.base_output_dir, "viewcounts", out_folder)
        os.makedirs(out_dir, exist_ok=True)

        args = ["--print", "%(view_count)s"]
        views_str = self.run_yt_dlp(common_args + args, url, "Fetching Views")
        
        if views_str and views_str.isdigit():
            formatted = f"{int(views_str):,}"
            filepath = os.path.join(out_dir, f"{safe_title}.txt")
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(formatted)
        else:
            self.log_message.emit("    No view count found.")

    def fetch_likes(self, url, safe_title, out_folder, common_args):
        out_dir = os.path.join(self.base_output_dir, "videostats", out_folder)
        os.makedirs(out_dir, exist_ok=True)

        args = ["--print", "%(like_count)s"]
        likes_str = self.run_yt_dlp(common_args + args, url, "Fetching Likes")
        
        if likes_str and likes_str.isdigit():
            likes = int(likes_str)
            min_dis = likes * 3 // 100
            max_dis = likes * 5 // 100
            
            dislikes = 0
            if likes > 0:
                if max_dis <= min_dis: 
                    max_dis = min_dis + 1
                dislikes = random.randint(min_dis, max_dis)
                if dislikes < 1: dislikes = 1
            
            content = f"{likes},{dislikes}"
            filepath = os.path.join(out_dir, f"{safe_title}.txt")
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)
        else:
            self.log_message.emit("    No ratings found.")

    def fetch_thumbnail(self, url, safe_title, out_folder, common_args):
        out_dir = os.path.join(self.base_output_dir, "thumbnails", out_folder)
        os.makedirs(out_dir, exist_ok=True)

        out_template = os.path.join(out_dir, "%(title)s.%(ext)s")
        args = ["--write-thumbnail", "--skip-download", "--convert-thumbnails", "jpg", "-o", out_template]
        
        self.run_yt_dlp(common_args + args, url, "Fetching Thumbnail")

    def fetch_description(self, url, safe_title, out_folder, common_args):
        out_dir = os.path.join(self.base_output_dir, "descriptions", out_folder)
        os.makedirs(out_dir, exist_ok=True)

        out_template = os.path.join(out_dir, "%(title)s.%(ext)s")
        args = ["--write-description", "--skip-download", "-o", out_template]
        
        self.run_yt_dlp(common_args + args, url, "Fetching Description")

    # =========================================================================
    # NEW: Comment Fetching & Cleaning Logic
    # =========================================================================
    
    def _clean_comments_json(self, raw_json_str):
        """Parses the massive yt-dlp JSON and extracts only the clean comment data."""
        try:
            data = json.loads(raw_json_str)
            raw_comments = data.get('comments')
            
            if not raw_comments:
                return None
            
            cleaned_comments = []
            for c in raw_comments:
                # Convert UNIX timestamp to readable UTC string
                readable_time = ""
                if c.get("timestamp"):
                    readable_time = datetime.fromtimestamp(c["timestamp"], tz=timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
                
                cleaned_c = {
                    "author": c.get("author"),
                    "is_verified": c.get("author_is_verified"),
                    "is_uploader": c.get("author_is_uploader"),
                    "text": c.get("text"),
                    "likes": c.get("like_count", 0),
                    "published_at": readable_time,
                    "is_pinned": c.get("is_pinned"),
                    "is_reply": c.get("parent") != "root",
                    "parent_id": c.get("parent") if c.get("parent") != "root" else None
                }
                cleaned_comments.append(cleaned_c)
                
            # Sort chronologically (oldest first)
            cleaned_comments.sort(key=lambda x: x["published_at"])
            return cleaned_comments
            
        except json.JSONDecodeError:
            return None
        except Exception:
            return None

    def fetch_comments(self, url, safe_title, out_folder, common_args):
        """Fetches comments, cleans them, and saves to comments/<channel>/<title>.json"""
        out_dir = os.path.join(self.base_output_dir, "comments", out_folder)
        os.makedirs(out_dir, exist_ok=True)
        
        # We use a temporary file to avoid Windows stdout encoding issues 
        # with massive JSON strings containing emojis/international characters
        temp_file = os.path.join(out_dir, f"{safe_title}_temp_raw")
        args = [
            "--write-comments", 
            "--write-info-json", 
            "--skip-download", 
            "-o", temp_file
        ]
        
        self.run_yt_dlp(common_args + args, url, "Fetching Comments")
        
        # yt-dlp automatically appends .info.json
        temp_file_full = f"{temp_file}.info.json"
        
        if not os.path.exists(temp_file_full):
            self.log_message.emit("    Comments file not created (comments may be disabled).")
            return
            
        try:
            # Read safely as UTF-8
            with open(temp_file_full, 'r', encoding='utf-8') as f:
                raw_json_str = f.read()
                
            cleaned_comments = self._clean_comments_json(raw_json_str)
            
            if not cleaned_comments:
                self.log_message.emit("    No comments found or failed to parse.")
            else:
                # Save the cleaned, formatted version
                filepath = os.path.join(out_dir, f"{safe_title}.json")
                with open(filepath, "w", encoding="utf-8") as f:
                    json.dump(cleaned_comments, f, indent=4, ensure_ascii=False)
                    
                self.log_message.emit(f"    Saved {len(cleaned_comments)} cleaned comments.")
                
        except Exception as e:
            self.log_message.emit(f"    Error processing comments: {str(e)}")
        finally:
            # Always clean up the massive 600kb+ temp file
            if os.path.exists(temp_file_full):
                try:
                    os.remove(temp_file_full)
                except:
                    pass

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("LocalYT Metadata Fetcher")
        self.setGeometry(100, 100, 650, 550)

        self.worker = None
        self.init_ui()

    def init_ui(self):
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        layout = QVBoxLayout(central_widget)

        btn_layout = QHBoxLayout()
        self.btn_add = QPushButton("Add Files")
        self.btn_add.clicked.connect(self.add_files)
        
        self.btn_set_name = QPushButton("Set Output Name")
        self.btn_set_name.clicked.connect(self.set_output_name)
        
        self.btn_remove = QPushButton("Remove Selected")
        self.btn_remove.clicked.connect(self.remove_selected)
        
        btn_layout.addWidget(self.btn_add)
        btn_layout.addWidget(self.btn_set_name)
        btn_layout.addWidget(self.btn_remove)
        layout.addLayout(btn_layout)

        layout.addWidget(QLabel("Files to Process (Double-click to rename):"))
        self.list_widget = QListWidget()
        self.list_widget.itemDoubleClicked.connect(self.set_output_name)
        layout.addWidget(self.list_widget)

        self.progress_label = QLabel("Ready")
        layout.addWidget(self.progress_label)
        self.progress_bar = QProgressBar()
        self.progress_bar.setValue(0)
        layout.addWidget(self.progress_bar)

        layout.addWidget(QLabel("Log:"))
        self.log_output = QListWidget()
        self.log_output.setWordWrap(True)
        layout.addWidget(self.log_output)

        self.btn_start = QPushButton("Start Processing")
        self.btn_start.setMinimumHeight(40)
        self.btn_start.setStyleSheet("background-color: #4CAF50; color: white; font-weight: bold;")
        self.btn_start.clicked.connect(self.start_processing)
        layout.addWidget(self.btn_start)

        self.auto_load_files()

    def auto_load_files(self):
        matches = glob.glob("*_video*.txt")
        if matches:
            for f in matches:
                self.add_file_item(f)
            self.log("Auto-loaded matching files found in directory.")

    def add_file_item(self, filepath):
        for i in range(self.list_widget.count()):
            if self.list_widget.item(i).data(Qt.UserRole)['path'] == filepath:
                return

        filename = os.path.basename(filepath)
        default_name = filename.replace("_videos.txt", "").replace("_video.txt", "")
        if not default_name:
            default_name = os.path.splitext(filename)[0]

        item = QListWidgetItem()
        item.setData(Qt.UserRole, {'path': filepath, 'output': default_name})
        self.update_item_text(item, filepath, default_name)
        self.list_widget.addItem(item)

    def update_item_text(self, item, path, output):
        filename = os.path.basename(path)
        item.setText(f"{filename}  [Output: {output}]")

    def add_files(self):
        files, _ = QFileDialog.getOpenFileNames(self, "Select Video List Files", "", "Text Files (*.txt)")
        for f in files:
            self.add_file_item(f)
    
    def set_output_name(self):
        item = self.list_widget.currentItem()
        if not item:
            return
        
        data = item.data(Qt.UserRole)
        current_name = data['output']
        
        text, ok = QInputDialog.getText(self, "Output Folder Name", 
                                        f"Enter output folder name for:\n{os.path.basename(data['path'])}", 
                                        QLineEdit.Normal, current_name)
        if ok and text:
            data['output'] = text
            item.setData(Qt.UserRole, data)
            self.update_item_text(item, data['path'], text)

    def remove_selected(self):
        for item in self.list_widget.selectedItems():
            self.list_widget.takeItem(self.list_widget.row(item))

    def clear_list(self):
        self.list_widget.clear()

    def log(self, message):
        self.log_output.addItem(message)
        self.log_output.scrollToBottom()

    def start_processing(self):
        if self.list_widget.count() == 0:
            QMessageBox.warning(self, "No Files", "Please add files to process.")
            return

        if not os.path.exists(YT_DLP_PATH):
            QMessageBox.critical(self, "Error", f"{YT_DLP_PATH} not found!")
            return

        file_queue = []
        for i in range(self.list_widget.count()):
            data = self.list_widget.item(i).data(Qt.UserRole)
            file_queue.append(data)
        
        self.btn_start.setEnabled(False)
        self.btn_start.setText("Processing...")
        self.progress_bar.setValue(0)
        self.log("Starting processing thread...")

        self.worker = WorkerThread(file_queue)
        self.worker.progress_update.connect(self.update_progress)
        self.worker.log_message.connect(self.log)
        self.worker.finished_processing.connect(self.on_finished)
        self.worker.start()

    def update_progress(self, current, total, message):
        self.progress_bar.setMaximum(total)
        self.progress_bar.setValue(current)
        self.progress_label.setText(message)

    def on_finished(self):
        self.btn_start.setEnabled(True)
        self.btn_start.setText("Start Processing")
        self.progress_label.setText("Finished!")
        self.log("All tasks completed.")
        QMessageBox.information(self, "Done", "All metadata fetching completed!")

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec_())