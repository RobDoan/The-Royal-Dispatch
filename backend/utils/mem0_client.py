import os
from mem0 import Memory

_memory = None

def get_memory() -> Memory:
    """Returns a singleton mem0 Memory instance configured to use Qdrant."""
    global _memory
    if _memory is None:
        qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
        config = {
            "vector_store": {
                "provider": "qdrant",
                "config": {
                    "url": qdrant_url,
                },
            },
        }
        _memory = Memory.from_config(config)
    return _memory
