#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASHRC="$HOME/.bashrc"
CONDA_ROOT="/anaconda"

"$SCRIPT_DIR/devcontainer-setup.sh"

remove_path() {
  local path="$1"
  [ -e "$path" ] || [ -L "$path" ] || return

  if [ -w "$(dirname "$path")" ]; then
    rm -rf "$path"
  else
    sudo rm -rf "$path"
  fi
}

remove_conda_from_bashrc() {
  [ -f "$BASHRC" ] || return

  echo "Removing conda initialization from $BASHRC..."
  python3 - "$BASHRC" <<'PY'
from pathlib import Path
import re
import sys

bashrc = Path(sys.argv[1])
text = bashrc.read_text()

text = re.sub(
    r"\n?# >>> conda initialize >>>.*?# <<< conda initialize <<<\n?",
    "\n",
    text,
    flags=re.DOTALL,
)

lines = []
for line in text.splitlines():
    stripped = line.strip()
    if "conda" in stripped and (
        "conda.sh" in stripped
        or "etc/profile.d/conda" in stripped
        or "/anaconda/bin" in stripped
        or "/anaconda/condabin" in stripped
    ):
        continue
    lines.append(line)

bashrc.write_text("\n".join(lines).rstrip() + "\n")
PY
}

remove_conda_from_bashrc

# Azure ML compute instances install conda and all envs under /anaconda.
# Removing this directory deletes base, every env, package caches, and conda itself.
echo "Removing conda installation and all environments: $CONDA_ROOT"
remove_path "$CONDA_ROOT"

remove_path "$HOME/.conda"
remove_path "$HOME/.condarc"
remove_path "$HOME/.continuum"

echo "Compute instance setup complete. Restart your shell to ensure conda is gone."
