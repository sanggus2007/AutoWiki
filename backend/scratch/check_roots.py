import sqlite3

def main():
    db_path = 'd:/AntigravityProject/AutoWiki/backend/autowiki_v2.db'
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("--- DB ROOT NODE STATUS ---")
    
    cursor.execute("SELECT id, name FROM projects")
    projects = cursor.fetchall()
    
    for p_id, p_name in projects:
        print(f"\n[Project: {p_name} (ID: {p_id})]")
        
        cursor.execute("SELECT slug, name FROM entities WHERE project_id = ? AND is_root = 1", (p_id,))
        roots = cursor.fetchall()
        
        if not roots:
            print("  -> [X] NO ROOT DEFINED")
        else:
            for r_slug, r_name in roots:
                print(f"  -> [OK] ROOT: {r_name} ({r_slug})")
                
    conn.close()

if __name__ == "__main__":
    main()
