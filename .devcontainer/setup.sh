#!/bin/bash

# Ensure we're running as root
if [ "$(id -u)" != "0" ]; then
   echo "This script must be run as root" 
   exit 1
fi

# Create necessary directories
mkdir -p /home/vscode/.local/share/bash-completion/completions
mkdir -p /workspace/kube
mkdir -p /workspace/repos

# Add vscode user to docker group
usermod -aG docker vscode

# Set initial permissions
chown -R vscode:vscode /home/vscode/.local
chown -R vscode:vscode /home/vscode/.cache/deno
chown -R vscode:vscode /home/vscode/.deno
chown -R vscode:vscode /workspace/kube
chown -R vscode:vscode /workspace/repos
# Setup environment for vscode user
sudo -u vscode bash << 'EOF'
# Activate docker group in current session
newgrp docker << 'INNEREOF'

# Add Deno to PATH
echo 'export PATH="/home/vscode/.deno/bin:$PATH"' >> ~/.bashrc
echo 'export PATH="/home/vscode/.deno/bin:$PATH"' >> ~/.profile

# Setup command completion
mkdir -p "$HOME/.local/share/bash-completion/completions"
cp /workspace/scripts/completion.sh "$HOME/.local/share/bash-completion/completions/quark"
echo 'source ~/.local/share/bash-completion/completions/quark' >> ~/.bashrc
echo 'source ~/.local/share/bash-completion/completions/quark' >> ~/.profile

# Install Quark CLI
$HOME/.deno/bin/deno install --global -A -f --config /workspace/deno.json --name quark /workspace/main.ts
INNEREOF
EOF

echo "✅ Development environment setup complete!"
echo
echo "To complete the setup, run:"
echo "  quark setup   - Set up kubernetes and configure services"
echo
echo "Then you can use:"
echo "  quark add     - Add local services"
echo "  quark remove  - Remove local services"
echo "  quark start   - Start configured services"
echo
echo "Try 'quark --help' for more information."