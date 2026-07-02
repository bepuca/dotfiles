#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASHRC="$HOME/.bashrc"
CONDA_ROOT="/anaconda"

remove_path() {
  local path="$1"
  [ -e "$path" ] || [ -L "$path" ] || return

  if [ -w "$(dirname "$path")" ]; then
    rm -rf "$path"
  else
    sudo rm -rf "$path"
  fi
}

apt_source_files() {
  local source

  for source in /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do
    [ -f "$source" ] && echo "$source"
  done
}

failed_apt_urls() {
  local log_file="$1"

  /usr/bin/python3 - "$log_file" <<'PY'
from pathlib import Path
import re
import sys

text = Path(sys.argv[1]).read_text(errors="ignore")
urls = []
for line in text.splitlines():
    if line.startswith("Err:") or line.startswith("E: Failed to fetch"):
        urls.extend(re.findall(r"https?://\S+", line))

for url in dict.fromkeys(url.rstrip(",") for url in urls):
    print(url)
PY
}

disable_apt_source_for_url() {
  local url="$1"
  local sources=()
  local matches=()
  local source
  local disabled_source

  mapfile -t sources < <(apt_source_files)
  [ ${#sources[@]} -gt 0 ] || return 1

  mapfile -t matches < <(/usr/bin/python3 - "$url" "${sources[@]}" <<'PY'
from pathlib import Path
import sys
from urllib.parse import urlparse

url = sys.argv[1]
sources = [Path(path) for path in sys.argv[2:]]
parsed = urlparse(url)
hosts = {parsed.netloc}
if parsed.netloc == "ppa.launchpadcontent.net":
    hosts.add("ppa.launchpad.net")

path_parts = [part for part in parsed.path.split("/") if part]
needles = set(hosts)
for length in range(2, min(3, len(path_parts)) + 1):
    needles.add("/".join(path_parts[:length]))

for source in sources:
    text = source.read_text(errors="ignore")
    if any(needle and needle in text for needle in needles):
        print(source)
PY
)

  [ ${#matches[@]} -gt 0 ] || return 1

  for source in "${matches[@]}"; do
    disabled_source="$source.disabled-by-compute-instance-setup"
    echo "Disabling apt source that failed during update: $source"
    sudo mv "$source" "$disabled_source"
  done
}

apt_update_disabling_broken_sources() {
  local attempt
  local log_file
  local url
  local urls=()
  local disabled_any
  local status

  for attempt in 1 2 3; do
    log_file="$(mktemp)"
    echo "Running apt-get update, attempt $attempt..."

    set +e
    sudo apt-get update 2>&1 | tee "$log_file"
    status=${PIPESTATUS[0]}
    set -e

    if [ "$status" -eq 0 ]; then
      rm -f "$log_file"
      return 0
    fi

    mapfile -t urls < <(failed_apt_urls "$log_file")
    rm -f "$log_file"

    [ ${#urls[@]} -gt 0 ] || return "$status"

    disabled_any=0
    for url in "${urls[@]}"; do
      if disable_apt_source_for_url "$url"; then
        disabled_any=1
      fi
    done

    [ "$disabled_any" -eq 1 ] || return "$status"
  done

  sudo apt-get update
}

remove_conda_from_bashrc() {
  [ -f "$BASHRC" ] || return

  echo "Removing conda initialization from $BASHRC..."
  /usr/bin/python3 - "$BASHRC" <<'PY'
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

apt_update_disabling_broken_sources
"$SCRIPT_DIR/devcontainer-setup.sh"

echo "Compute instance setup complete. Restart your shell to ensure conda is gone."
