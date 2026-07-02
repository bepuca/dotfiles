# prompt
eval "$(starship init zsh)"

# tool/runtime versions
eval "$(mise activate zsh)"

# global python
eval "$(uv python update-shell)"

# smarter cd
eval "$(zoxide init zsh)"

source "$(brew --prefix)/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"

alias ll="eza -la --icons"
alias ls="eza --icons"
alias b="bat"
alias python="uv run python"
