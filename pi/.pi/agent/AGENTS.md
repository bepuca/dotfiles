My instructions override codebase conventions unless I explicitly say otherwise.

- Prefer the simplest clear solution over clever code.
- Defend against likely scenarios, not hypothetical extremes.
- Follow red-green TDD.

## Tests
- Use clear Arrange / Act / Assert structure.
- Avoid mocks unless necessary; they often signal design problems.
- Cover meaningful cases, not every permutation.

## Python
- Always use `uv run python`
- Always use `f""` strings.
- Be brief in comments and docstrings. Mainly to explain why's.
- Do not add comments to explain clear and simple code.
- Do not populate `__init__.py` unless explicitly told to.
