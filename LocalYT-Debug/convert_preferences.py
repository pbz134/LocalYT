#!/usr/bin/env python3
import json
import os
import shutil
from datetime import datetime

def convert_scores_to_percentages():

    preferences_file = os.path.join('..', 'userPreferences.json')
    
    if not os.path.exists(preferences_file):
        print("Error: userPreferences.json not found in parent folder!")
        return False
    
    with open(preferences_file, 'r', encoding='utf-8') as f:
        all_prefs = json.load(f)
    
    print("Loaded preferences for " + str(len(all_prefs)) + " users")
    print("File location: " + preferences_file)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = os.path.join('..', 'userPreferences_backup_' + timestamp + '.json')
    shutil.copy2(preferences_file, backup_file)
    print("Created backup at " + backup_file)
    
    converted_count = 0
    malformed_removed = 0
    TOP_TAGS_KEEP = 20
    
    for user_id, prefs in all_prefs.items():
        if not prefs:
            continue
        
        cleaned_prefs = {}
        for tag, score in prefs.items():
            if '\n' in tag or len(tag) > 100:
                print("Removing malformed tag: " + tag[:50] + "...")
                malformed_removed += 1
                continue
            cleaned_prefs[tag] = score
        
        if not cleaned_prefs:
            all_prefs[user_id] = {}
            continue
        
        sorted_tags = sorted(cleaned_prefs.items(), key=lambda x: x[1], reverse=True)
        top_tags = sorted_tags[:TOP_TAGS_KEEP]
        
        total = sum(score for _, score in top_tags)
        
        if total == 0:
            all_prefs[user_id] = {}
            continue
        
        percentage_prefs = {}
        for tag, score in top_tags:
            pct = (score / total) * 100
            percentage_prefs[tag] = round(pct, 2)
        
        total_pct = sum(percentage_prefs.values())
        if total_pct != 100.0 and percentage_prefs:
            largest = max(percentage_prefs.items(), key=lambda x: x[1])
            adjustment = round(100.0 - total_pct, 2)
            percentage_prefs[largest[0]] = round(largest[1] + adjustment, 2)
        
        all_prefs[user_id] = percentage_prefs
        converted_count += 1
        
        if converted_count <= 3:
            print("User " + user_id[:8] + "...: " + str(len(cleaned_prefs)) + " tags -> " + str(len(percentage_prefs)) + " tags (kept top " + str(TOP_TAGS_KEEP) + ")")
    
    with open(preferences_file, 'w', encoding='utf-8') as f:
        json.dump(all_prefs, f, indent=2, ensure_ascii=False)
    
    print("")
    print("Successfully overwrote " + preferences_file)
    print("")
    print("Summary:")
    print("  - Users converted: " + str(converted_count))
    print("  - Malformed tags removed: " + str(malformed_removed))
    print("  - Tags kept per user: Top " + str(TOP_TAGS_KEEP))
    print("  - Backup saved: " + backup_file)
    
    return True

if __name__ == "__main__":
    print("Convert userPreferences.json from raw scores to percentages")
    print("To migrate from the old score-based algorithm system (LocalYT v4.80 and below)")
    print("to the new percentage-based algorithm system (LocalYT v.4.90 and up)")
    print("")
    
    response = input("Continue? (yes/no): ")
    if response.lower() in ['yes', 'y']:
        convert_scores_to_percentages()
        print("")
        print("Done! Your top 20 tags are now percentages.")
    else:
        print("")
        print("Cancelled.")