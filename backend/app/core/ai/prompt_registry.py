from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from pydantic import BaseModel

from app.core.exceptions import InternalError

_PROMPT_DIR = Path(__file__).resolve().parent / "prompts"


class PromptMetadata(BaseModel):
    """Metadata describing a specific prompt template."""
    name: str
    version: str
    variables: list[str]
    description: str | None = None


@lru_cache(maxsize=32)
def get_prompt(prompt_name: str, version: str = "v1") -> str:
    """Load a versioned prompt template from app/core/ai/prompts."""
    path = _PROMPT_DIR / f"{prompt_name}_{version}.txt"
    try:
        return path.read_text(encoding="utf-8").strip()
    except FileNotFoundError as exc:
        raise InternalError(
            f"AI prompt '{prompt_name}_{version}' is not registered.",
            code="AI_PROMPT_NOT_FOUND",
        ) from exc


def get_prompt_metadata(prompt_name: str, version: str = "v1") -> PromptMetadata:
    """Load a prompt and extract its metadata and required variables."""
    content = get_prompt(prompt_name, version)
    
    # Extract variables formatted as {{variable_name}}
    variable_matches = re.findall(r"\{\{([^}]+)\}\}", content)
    unique_vars = sorted(list(set(variable_matches)))
    
    # Simple heuristic for description: first line if it doesn't look like a role definition
    # or just generic fallback.
    lines = content.split("\n")
    desc = "Standard Mindexa AI Agent prompt."
    if lines and len(lines[0]) < 100:
        desc = lines[0].strip()

    return PromptMetadata(
        name=prompt_name,
        version=version,
        variables=unique_vars,
        description=desc,
    )

def list_all_prompts() -> list[PromptMetadata]:
    """Scan the prompts directory and return metadata for all available templates."""
    results = []
    if not _PROMPT_DIR.exists():
        return results
        
    for file in _PROMPT_DIR.glob("*.txt"):
        # Expecting format: name_v1.txt
        parts = file.stem.rsplit("_", 1)
        if len(parts) == 2:
            name, version = parts
            try:
                meta = get_prompt_metadata(name, version)
                results.append(meta)
            except Exception:
                continue
                
    return sorted(results, key=lambda m: (m.name, m.version))
