#!/usr/bin/env bash

config_dir="${HOME}/Library/Application Support"
source_dir="${config_dir}/Code/User"
target_dir="${config_dir}/Code - Insiders/User"

mkdir -p "${target_dir}"

ln -sf "${source_dir}/settings.json" "${target_dir}/settings.json"
ln -sf "${source_dir}/keybindings.json" "${target_dir}/keybindings.json"