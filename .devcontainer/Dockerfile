FROM mcr.microsoft.com/devcontainers/javascript-node:24

USER root
RUN apt-get update \
    && apt-get install --yes --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*
USER node
