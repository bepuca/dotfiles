# user binaries
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
  export PATH="$HOME/.local/bin:$PATH"
fi

# prompt
eval "$(starship init zsh)"

# tool/runtime versions
eval "$(mise activate zsh)"

# smarter cd
eval "$(zoxide init zsh)"

source "$(brew --prefix)/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"

alias ls="ls -FGa1"
alias b="bat"
alias python="uv run python"

set -o vi
