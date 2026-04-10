import os
from sqlalchemy import create_engine, MetaData
from sqlalchemy.orm import sessionmaker

sqlite_url = "sqlite:///./autowiki_v2.db"
postgres_url = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres.zlcfxwzfxlwczlhefeyh:Deniously==491733@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres"
)

sqlite_engine = create_engine(sqlite_url)
pg_engine = create_engine(postgres_url)

meta = MetaData()
meta.reflect(bind=sqlite_engine)

meta.create_all(bind=pg_engine)

import sys

def migrate():
    try:
        # 1. PostgreSQL 쪽 데이터를 모두 비웁니다 (의존성 역순)
        print("Clearing existing data in PostgreSQL...")
        for table in reversed(meta.sorted_tables):
            with pg_engine.begin() as p_conn:
                p_conn.execute(table.delete())
                
        # 2. SQLite에서 읽어서 삽입 (의존성 순서)
        for table in meta.sorted_tables:
            print(f"Migrating table '{table.name}'...")
            
            with sqlite_engine.connect() as s_conn:
                records = s_conn.execute(table.select()).fetchall()
            
            if not records:
                print(f"  -> No data to migrate in {table.name}.")
                continue

            with pg_engine.begin() as p_conn:
                keys = table.columns.keys()
                bool_cols = ["is_selected", "is_root"]
                
                inserted_count = 0
                for row in records:
                    row_dict = dict(zip(keys, row))
                    for bc in bool_cols:
                        if bc in row_dict and row_dict[bc] is not None:
                            row_dict[bc] = bool(row_dict[bc])
                    
                    try:
                        # 레코드 단위로 삽입하여 무결성 에러 발생 시 건너뜁니다
                        p_conn.execute(table.insert(), [row_dict])
                        inserted_count += 1
                    except Exception as e:
                        # SQLite의 더티 데이터(고아 레코드) 무시
                        pass
                
            print(f"  -> Successfully migrated {inserted_count} rows to {table.name}.")
            
    except Exception as e:
        error_msg = f"Migration error: {repr(e)}"
        sys.stderr.buffer.write(error_msg.encode('utf-8'))
        sys.stderr.flush()

if __name__ == "__main__":
    print("Starting database migration from SQLite to PostgreSQL...")
    migrate()
    print("\nMigration finished!")
