#!/bin/bash

# Git Setup Script for Development Container
# This script configures git credentials, SSH keys, and GPG signing

echo "🔧 Setting up Git configuration..."

# Function to check if git is configured
check_git_config() {
    local name=$(git config --global user.name 2>/dev/null || echo "")
    local email=$(git config --global user.email 2>/dev/null || echo "")
    
    if [ -z "$name" ] || [ -z "$email" ]; then
        return 1
    fi
    return 0
}

# Function to configure git user
configure_git_user() {
    echo "📝 Configuring Git user information..."

    if ! check_git_config; then
        echo "ℹ️  Git user not configured. You can set it with:"
        echo "   git config --global user.name 'Your Name'"
        echo "   git config --global user.email 'your.email@example.com'"
        echo "   or set GIT_USER_NAME and GIT_USER_EMAIL environment variables"
    fi
}

configure_git_settings() {
    echo "⚙️  Configuring Git settings..."
    
    # Basic configuration
    git config --global init.defaultBranch main
    git config --global pull.rebase false
    git config --global push.default simple
    git config --global core.autocrlf input
    git config --global core.editor "code --wait"
    
    # Better diff and merge tools
    git config --global diff.tool vscode
    git config --global difftool.vscode.cmd 'code --wait --diff $LOCAL $REMOTE'
    git config --global merge.tool vscode
    git config --global mergetool.vscode.cmd 'code --wait $MERGED'
    
    # Useful aliases
    git config --global alias.st status
    git config --global alias.co checkout
    git config --global alias.br branch
    git config --global alias.ci commit
    git config --global alias.unstage 'reset HEAD --'
    git config --global alias.last 'log -1 HEAD'
    git config --global alias.visual '!gitk'
    git config --global alias.graph 'log --oneline --graph --decorate --all'
    git config --global alias.pushf 'push --force-with-lease'
    
    echo "✅ Git settings configured"
}

# Function to configure GPG signing
configure_gpg_signing() {
    echo "🔐 Configuring GPG signing..."
    
    # Check if GPG keys are available
    if command -v gpg >/dev/null 2>&1; then

        export GPG_TTY=$(tty)
        echo 'export GPG_TTY=$(tty)' >> ~/.bashrc
        
        # Get the first available GPG key
        local gpg_key=$(gpg --list-secret-keys --keyid-format=long 2>/dev/null | grep sec | head -1 | sed 's/.*\/\([A-F0-9]*\) .*/\1/')
        
        if [ -n "$gpg_key" ]; then
            echo "   Found GPG key: $gpg_key"
            git config --global user.signingkey "$gpg_key"
            git config --global commit.gpgsign true
            git config --global tag.gpgsign true
            
            # Configure GPG program
            git config --global gpg.program gpg
            
            echo "✅ GPG signing enabled with key: $gpg_key"
        else
            echo "ℹ️  No GPG keys found. Signing disabled."
            git config --global commit.gpgsign false
        fi
    else
        echo "ℹ️  GPG not available. Signing disabled."
        git config --global commit.gpgsign false
    fi
}

# Main execution
main() {
    echo "🚀 Starting Git setup for development container..."
    
    configure_git_user
    configure_git_settings
    configure_gpg_signing
    
    echo
    echo "✅ Git setup complete!"
    echo
    echo "📋 Summary:"
    echo "   • Git user: $(git config --global user.name 2>/dev/null || echo 'Not configured')"
    echo "   • Git email: $(git config --global user.email 2>/dev/null || echo 'Not configured')"
    echo "   • SSH key: $([ -f ~/.ssh/id_ed25519 ] && echo 'Present' || echo 'Not found')"
    echo "   • GPG key: $(gpg --list-secret-keys --keyid-format=long 2>/dev/null | grep -q sec && echo 'Present' || echo 'Not found')"
    echo "   • Signing: $(git config --global commit.gpgsign 2>/dev/null || echo 'Disabled')"
    echo
    if [ -f ~/.ssh/id_ed25519.pub ]; then
        # Check if SSH key is valid for GitHub
        ssh -o StrictHostKeyChecking=no -T git@github.com 2>&1 | grep -q "successfully authenticated" 
        if [ $? -eq 0 ]; then
            echo "✅ SSH key is valid and recognized by GitHub."
        else
            echo "⚠️  SSH key is not recognized by GitHub."
            echo
            echo "$(cat ~/.ssh/id_ed25519.pub)"
            echo
            echo "Please add the above public key to your GitHub account: https://github.com/settings/keys"
        fi
    else
        echo "No SSH public key found at ~/.ssh/id_ed25519.pub"
        echo "Generate one with: ssh-keygen -t ed25519 -C \"your.email@example.com\""
    fi
}

main "$@"
