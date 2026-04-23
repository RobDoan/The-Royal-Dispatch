"""Validates that every persona YAML has the fields required by the call feature."""
from pathlib import Path

import pytest
import yaml

PERSONAS_DIR = Path(__file__).parent.parent / "personas"
PERSONA_FILES = sorted(PERSONAS_DIR.glob("*.yaml"))


@pytest.mark.parametrize("path", PERSONA_FILES, ids=lambda p: p.stem)
def test_persona_has_call_system_prompt(path: Path):
    data = yaml.safe_load(path.read_text())
    assert "call_system_prompt" in data, f"{path.name} missing call_system_prompt"
    prompt = data["call_system_prompt"]
    assert isinstance(prompt, dict), f"{path.name} call_system_prompt must be a dict"
    assert prompt.get("en"), f"{path.name} call_system_prompt.en is empty"
    assert prompt.get("vi"), f"{path.name} call_system_prompt.vi is empty"


@pytest.mark.parametrize("path", PERSONA_FILES, ids=lambda p: p.stem)
def test_persona_has_call_first_message(path: Path):
    data = yaml.safe_load(path.read_text())
    assert "call_first_message" in data, f"{path.name} missing call_first_message"
    msg = data["call_first_message"]
    assert isinstance(msg, dict), f"{path.name} call_first_message must be a dict"
    assert msg.get("en"), f"{path.name} call_first_message.en is empty"
    assert msg.get("vi"), f"{path.name} call_first_message.vi is empty"
    assert "{child_name}" in msg["en"], f"{path.name} call_first_message.en must contain {{child_name}}"
    assert "{child_name}" in msg["vi"], f"{path.name} call_first_message.vi must contain {{child_name}}"
