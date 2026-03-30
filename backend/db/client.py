import os
from contextlib import contextmanager
import psycopg2
from psycopg2 import pool
from dotenv import load_dotenv

load_dotenv()

_pool = None


def get_db():
    global _pool
    if _pool is None:
        _pool = pool.SimpleConnectionPool(1, 10, dsn=os.environ["DATABASE_URL"])
    return _pool


@contextmanager
def get_conn():
    p = get_db()
    conn = p.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        p.putconn(conn)
