#!/bin/bash
set -e
deno install --global -A -f --config deno.json --name quark main.ts
# Install the CLI globally
export PATH="/root/.deno/bin:$PATH"
# Setup shell completion
COMPLETION_DIR="$HOME/.local/share/bash-completion/completions"
mkdir -p "$COMPLETION_DIR"
cp scripts/completion.sh "$COMPLETION_DIR/quark"
source ~/.local/share/bash-completion/completions/quark
source scripts/completion.sh
echo "✅ Successfully setup quark autocompletions"

