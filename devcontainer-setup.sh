#!/usr/bin/env bash
set -e

DOTFILES_DIR="$HOME/dotfiles"

if ! command -v sudo >/dev/null; then
  echo "sudo is required"
  exit 1
fi

# general apt packages

APT_PACKAGES=()
command -v stow >/dev/null || APT_PACKAGES+=(stow)
command -v curl >/dev/null || APT_PACKAGES+=(curl)

if [ ${#APT_PACKAGES[@]} -gt 0 ]; then
  echo "Installing: ${APT_PACKAGES[*]}..."
  sudo apt-get update
  sudo apt-get install -y "${APT_PACKAGES[@]}"
fi

# nodejs + npm modules

if ! command -v npm >/dev/null; then
  echo "Installing Node.js LTS..."
  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v pi >/dev/null; then
  echo "Installing pi..."
  npm install -g @mariozechner/pi-coding-agent || sudo npm install -g @mariozechner/pi-coding-agent
fi

# ensure configs are applied
cd "$DOTFILES_DIR"

stow git
stow pi