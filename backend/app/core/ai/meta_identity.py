from __future__ import annotations

import re

_META_IDENTITY_PATTERN = re.compile(
    r"(?:"
    # Direct model/LLM inquiries targeting the assistant ("which model are you", "what model is this", "what's your model", "what model are you using", "tell me your model")
    r"(?:which|what)\s+(?:ai\s+|language\s+|base\s+|underlying\s+)?(?:model|llm)\s+(?:are\s+you|is\s+(?:this|running|behind\s+this)|do\s+you\s+use|are\s+you\s+using)|"
    r"(?:which|what)\s+(?:ai|llm)\s+are\s+you|"
    r"(?:what(?:'s|\s+is)|tell\s+me)\s+your\s+(?:(?:ai\s+|language\s+|underlying\s+)?(?:model|llm)(?:\s+name)?)|"
    # Identity queries with specific provider/model names ("are you chatgpt", "are you gpt-4", "are you an openai model")
    r"are\s+you\s+(?:(?:a|an)\s+)?(?:chatgpt|gpt-?[345o\d\s]*|gemini|claude(?:\s+[\d.]+(?:\s+\w+)?)?|llama|copilot|openai(?:\s+model)?|anthropic)|"
    # Creator inquiries targeting the assistant ("who created you", "who made you", "what company made you")
    r"(?:who|what\s+company)\s+(?:made|created|built|developed|trained|programmed)\s+you|"
    # Prompt extraction queries ("what's your system prompt", "show me your system prompt", "what are your system instructions", "show your instructions")
    r"(?:what(?:'s|\s+(?:is|are))\s+|show\s+(?:me\s+)?|print\s+|reveal\s+|display\s+|repeat\s+|give\s+me\s+|output\s+)(?:your|the)\s+(?:(?:system|initial|developer|prompt|hidden)\s+)?(?:system\s+prompt|prompt|instructions|system\s+rules)(?:\b(?!\s+(?:on|for|to|about|in)\b))|"
    # Jailbreak / instruction override attempts ("ignore previous instructions", "disregard prior instructions", "forget all previous instructions")
    r"(?:ignore|disregard|forget|bypass)\s+(?:(?:all|your|previous|prior|past)\s+)*(?:instructions|system\s+prompt|guardrails|directives)"
    r")",
    re.IGNORECASE,
)

STUDENT_META_IDENTITY_DEFLECTION = (
    "I'm the Mindexa Study Assistant — I can't share details about the underlying AI system, "
    "but I'm happy to help with your coursework. What are you working on?"
)

LECTURER_META_IDENTITY_DEFLECTION = (
    "I'm the Mindexa Lecturer AI Assistant — I can't share details about the underlying AI system, "
    "but I'm happy to help with your teaching materials, rubrics, and coursework. What are you working on?"
)


def is_meta_identity_query(query: str | None) -> bool:
    """Deterministic check for meta-identity/system prompt/model extraction queries."""
    if not query or not query.strip():
        return False
    return bool(_META_IDENTITY_PATTERN.search(query))
