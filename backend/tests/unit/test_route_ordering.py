"""A parameterised route declared before a fixed sibling path swallows it.

FastAPI matches routes in declaration order, so ``GET /integrity/{attempt_id}`` placed above
``GET /integrity/profiles`` answers the request for "profiles" with a UUID validation error.
This walks every route and reports any such shadowing.
"""

from __future__ import annotations

from app.main import app


def _segments(path: str) -> list[str]:
    return [s for s in path.split("/") if s]


def _is_param(segment: str) -> bool:
    return segment.startswith("{") and segment.endswith("}")


def _shadowed_routes() -> list[str]:
    paths_by_method: dict[str, list[str]] = {}
    for path, operations in app.openapi()["paths"].items():
        for method in operations:
            paths_by_method.setdefault(method.upper(), []).append(path)

    problems: list[str] = []
    for method, paths in paths_by_method.items():
        for i, earlier in enumerate(paths):
            e = _segments(earlier)
            for later in paths[i + 1 :]:
                late = _segments(later)
                if len(e) != len(late):
                    continue
                for k, (a, b) in enumerate(zip(e, late)):
                    if a == b:
                        continue
                    # first difference: earlier has a parameter where the later path is fixed text,
                    # and the rest of the later path would also be matched by the earlier one
                    if _is_param(a) and not _is_param(b) and all(
                        _is_param(x) or x == y for x, y in zip(e[k + 1 :], late[k + 1 :])
                    ):
                        problems.append(f"{method} {earlier} is declared before {later} and shadows it")
                    break
    return problems


def test_no_parameterised_route_shadows_a_fixed_path():
    problems = _shadowed_routes()
    assert not problems, "\n".join(problems)
