import yaml
from pathlib import Path
from backend.state import RoyalStateOptional

PERSONAS_DIR = Path(__file__).parent.parent / "personas"

def load_persona(state: RoyalStateOptional) -> dict:
    persona_path = PERSONAS_DIR / f"{state['princess']}.yaml"
    if not persona_path.exists():
        raise FileNotFoundError(f"No persona found for princess: {state['princess']}")
    with open(persona_path) as f:
        persona = yaml.safe_load(f)
    return {"persona": persona}
