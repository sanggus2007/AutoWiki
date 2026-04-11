import sqlite3

def get_project_graph_context_mock(project_id, db_cursor):
    # 1. Fetch Entities
    db_cursor.execute("SELECT slug, is_root FROM entities WHERE project_id = ?", (project_id,))
    entities = db_cursor.fetchall()
    entity_slugs = {e[0] for e in entities}
    root_slugs = {e[0] for e in entities if e[1]}
    
    # 2. Fetch Relationships
    db_cursor.execute("SELECT id, source_entity_slug, target_entity_slug, context FROM relationships")
    relationships = db_cursor.fetchall()
    
    rel_texts = []
    adj = {slug: [] for slug in entity_slugs}
    connection_counts = {slug: 0 for slug in entity_slugs}
    
    for r_id, source, target, context in relationships:
        if source in entity_slugs and target in entity_slugs:
            rel_texts.append(f"- [ID: {r_id}] {source} -> {target} ({context})")
            # Directed Edge: Only source -> target
            adj[source].append(target)
            connection_counts[source] += 1
            connection_counts[target] += 1
            
    # 3. BFS Reachability (Directed)
    reachable = set()
    queue = list(root_slugs)
    reachable.update(root_slugs)
    
    idx = 0
    while idx < len(queue):
        curr = queue[idx]
        idx += 1
        for neighbor in adj.get(curr, []):
            if neighbor not in reachable:
                reachable.add(neighbor)
                queue.append(neighbor)
                
    isolated = [s for s, count in connection_counts.items() if count == 0]
    unreachable_from_root = [s for s in entity_slugs if s not in reachable and s not in isolated]
    
    context_parts = []
    if isolated:
        context_parts.append("[❌ 고립된 노드 (연결 0개)]\n- " + ", ".join(isolated))
        
    if not root_slugs:
        context_parts.append("[⚠️ 루트 노드 미설정]\n현재 프로젝트에 메인 루트가 설정되어 있지 않습니다.")
    elif unreachable_from_root:
        context_parts.append(f"[🚫 루트 미도달 노드 (메인 주제 '{', '.join(root_slugs)}'와 단절됨)]\n- " + ", ".join(unreachable_from_root))
        
    if rel_texts:
        context_parts.append("[현재 지식 관계도 목록]\n" + "\n".join(rel_texts))
        
    return "\n".join(context_parts)

def main():
    db_path = 'd:/AntigravityProject/AutoWiki/backend/autowiki_v2.db'
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, name FROM projects")
    projects = cursor.fetchall()
    
    output = []
    for p_id, p_name in projects:
        output.append(f"=== Project: {p_name} (ID: {p_id}) ===")
        context = get_project_graph_context_mock(p_id, cursor)
        output.append(context)
        output.append("\n" + "="*50 + "\n")
        
    with open("current_graph_debug_directed.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(output))
    
    print("Directed Graph debug dumped to current_graph_debug_directed.txt")
    conn.close()

if __name__ == "__main__":
    main()
