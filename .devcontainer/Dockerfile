FROM mcr.microsoft.com/devcontainers/base:ubuntu

# Install basic tools
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -y --no-install-recommends \
    curl \
    git \
    wget \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    build-essential \
    sudo \
    && rm -rf /var/lib/apt/lists/*


# Install Docker
RUN curl -fsSL https://get.docker.com | sh

# Install k3d
RUN wget -q -O - https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash

# Install kubectl
RUN curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.29/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg \
    && echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.29/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list \
    && apt-get update \
    && apt-get install -y kubectl \
    && rm -rf /var/lib/apt/lists/*

RUN usermod -aG docker vscode

ARG USERNAME=vscode
# Install Deno
ENV DENO_INSTALL=/home/$USERNAME/.deno
ENV PATH=${DENO_INSTALL}/bin:${PATH}
RUN curl -fsSL https://deno.land/x/install/install.sh | sh \
    && chown -R $USERNAME:$USERNAME ${DENO_INSTALL} \
    && mkdir -p /home/$USERNAME/.cache/deno \
    && chown -R $USERNAME:$USERNAME /home/$USERNAME/.cache/deno

