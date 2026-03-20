ARG BUN_IMAGE=oven/bun:1.3.11
FROM ${BUN_IMAGE}

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        ca-certificates \
        curl \
        git \
        unzip \
        tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace/codex-feishu-bridge

ENTRYPOINT ["tini", "--"]
CMD ["bash"]
