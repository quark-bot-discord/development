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
mkdir -p /home/vscode/.local/state/vs-kubernetes/tools/kubectl
mkdir -p /home/vscode/.local/state/vs-kubernetes/tools/helm/linux-amd64

# Add vscode user to docker group
usermod -aG docker vscode

# Ensure kubectl is available and create symlink
if [ -f "/usr/local/bin/kubectl" ]; then
    ln -sf /usr/local/bin/kubectl /home/vscode/.local/state/vs-kubernetes/tools/kubectl/kubectl
fi

# Ensure helm is available and create symlink
if [ -f "/usr/local/bin/helm" ]; then
    ln -sf /usr/local/bin/helm /home/vscode/.local/state/vs-kubernetes/tools/helm/linux-amd64/helm
fi


# Set initial permissions
chown -R vscode:vscode /home/vscode/.local
chown -R vscode:vscode /home/vscode/.cache/deno
chown -R vscode:vscode /home/vscode/.deno
chown -R vscode:vscode /workspace/kube
chown -R vscode:vscode /home/vscode/.local/state/vs-kubernetes

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

# Setup kubectl completion
kubectl completion bash > /home/vscode/.local/share/bash-completion/completions/kubectl

# Setup helm completion
helm completion bash > /home/vscode/.local/share/bash-completion/completions/helm

# Verify installations
echo "Verifying installations..."
kubectl version --client
helm version
k3d version
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