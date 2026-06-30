# syntax=docker/dockerfile:1.7

# ----- Stage 1: build -----
FROM node:20.11.1-alpine AS build
WORKDIR /app

# Install all deps (including dev) for build + test
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY index.ts agent_cli.ts ./
COPY auto-apply/ ./auto-apply/
COPY capability-router/ ./capability-router/
COPY file-cleaner/ ./file-cleaner/
COPY security/ ./security/
COPY scripts/ ./scripts/
COPY skill-manager/ ./skill-manager/
COPY evolution/ ./evolution/
COPY task-planner/ ./task-planner/
COPY executor/ ./executor/
COPY verification/ ./verification/
COPY memory-store/ ./memory-store/
COPY error-recovery/ ./error-recovery/
COPY codegraph/ ./codegraph/
COPY evaluation/ ./evaluation/
COPY computer-control/ ./computer-control/
COPY agent-orchestration/ ./agent-orchestration/

RUN npm run build

# ----- Stage 2: runtime -----
FROM node:20.11.1-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Copy only what's needed to run the CLI
COPY package.json package-lock.json* ./
COPY --from=build /app/dist ./dist
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Verify the CLI works in the container
RUN node ./dist/scripts/capability-router-cli.js --help > /dev/null

# Default: print CLI help. Override CMD to run the agent or router.
CMD ["node", "./dist/scripts/capability-router-cli.js", "--help"]

# Image size optimization
LABEL org.opencontainers.image.title="mautoma-agent" \
      org.opencontainers.image.description="Autonomous AI agent runtime — CapabilityRouter, AutoApply engine, AI file cleaner" \
      org.opencontainers.image.source="https://github.com/huyhieu2k5/mautoma-agent" \
      org.opencontainers.image.licenses="MIT OR Apache-2.0"