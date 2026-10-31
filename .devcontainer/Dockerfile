FROM mcr.microsoft.com/devcontainers/javascript-node:24

USER root
RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
       postgresql-client \
       unzip \
       xvfb \
       x11vnc \
       x11-utils \
       novnc \
       websockify \
       openbox \
    && rm -rf /var/lib/apt/lists/*
USER node
