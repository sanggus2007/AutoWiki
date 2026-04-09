import os
import re

src_dir = "."

api_import_stmt = 'import { apiFetch } from "@/lib/api";\n'

for root, _, files in os.walk(src_dir):
    for filename in files:
        if filename.endswith(".tsx") or filename.endswith(".ts"):
            if filename == "api.ts" or filename == "store.ts":
                continue
            path = os.path.join(root, filename)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            
            # replace fetch("http://localhost:8000...") or fetch(`${API}...`) or fetch(url) where it's api related
            # To be safe, just replace fetch( with apiFetch( if it's hitting the backend.
            if "fetch(" in content and ("localhost:8000" in content or "API" in content or "url" in content):
                # replace fetch( with apiFetch(
                # but only if it's actually an API call. For simplicity let's do a simple regex for fetch(
                # and add the import.
                new_content = re.sub(r'\bfetch\(', 'apiFetch(', content)
                
                if new_content != content:
                    # add import if not present
                    if "apiFetch" not in content:
                        # find last import
                        lines = new_content.split('\n')
                        last_import_idx = 0
                        for i, line in enumerate(lines):
                            if line.startswith('import '):
                                last_import_idx = i
                        
                        lines.insert(last_import_idx + 1, api_import_stmt)
                        new_content = '\n'.join(lines)
                        
                    with open(path, "w", encoding="utf-8") as f:
                        f.write(new_content)
                        print(f"Updated {path}")
