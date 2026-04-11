import sqlite3

def find_islands(project_id):
    db_path = 'd:/AntigravityProject/AutoWiki/backend/autowiki_v2.db'
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get all entities
    cursor.execute("SELECT slug, is_root FROM entities WHERE project_id = ?", (project_id,))
    entities = cursor.fetchall()
    slugs = [e[0] for e in entities]
    roots = [e[0] for e in entities if e[1]]
    
    # Get all relationships
    cursor.execute("SELECT source_entity_slug, target_entity_slug FROM relationships")
    rels = cursor.fetchall()
    
    adj = {s: [] for s in slugs}
    for s, t in rels:
        if s in adj and t in adj:
            adj[s].append(t)
            adj[t].append(s) # Undirected for component analysis
            
    visited = set()
    components = []
    
    for s in slugs:
        if s not in visited:
            comp = []
            q = [s]
            visited.add(s)
            while q:
                curr = q.pop(0)
                comp.append(curr)
                for neighbor in adj[curr]:
                    if neighbor not in visited:
                        visited.add(neighbor)
                        q.append(neighbor)
            components.append(comp)
            
    print(f"Total Clusters found: {len(components)}")
    for i, comp in enumerate(components):
        has_root = any(r in comp for r in roots)
        root_status = "[ROOT CLUSTER]" if has_root else "[ISLAND]"
        print(f"Cluster {i+1} {root_status}: {len(comp)} nodes")
        if not has_root or len(comp) < 10: # Focus on islands or small clusters
            print(f"  Nodes: {', '.join(comp[:20])}...")
            
    conn.close()

if __name__ == "__main__":
    find_islands(6) # Alpha World ID 6
鼓
