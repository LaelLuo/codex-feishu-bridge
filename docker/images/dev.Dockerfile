ARG NODE_IMAGE=node:20-bookworm
ARG BUN_VERSION=1.3.11
FROM ${NODE_IMAGE}

ARG BUN_VERSION

ENV BUN_INSTALL=/usr/local/bun
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        build-essential \
        ca-certificates \
        curl \
        git \
        python3 \
        python3-pip \
        unzip \
        tini \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p "${BUN_INSTALL}" \
    && curl -fsSL https://bun.sh/install | bash -s -- "bun-v${BUN_VERSION}" \
    && ln -sf "${BUN_INSTALL}/bin/bun" /usr/local/bin/bun

WORKDIR /workspace/codex-feishu-bridge

ENTRYPOINT ["tini", "--"]
CMD ["bash"]
