#!/usr/bin/env bash
set -e

DOTFILES_DIR="$HOME/dotfiles"

if ! command -v stow >/dev/null; then
  if command -v sudo >/dev/null; then
    sudo apt-get update
    sudo apt-get install -y stow
  else
    echo "stow not installed and no sudo available"
    exit 1
  fi
fi

cd "$DOTFILES_DIR"

stow git
stow pi