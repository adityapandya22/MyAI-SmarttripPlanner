# MyTripPlanner — one container runs everything: the built web app and the
# agent server. The PORT env var (default 5200) controls the listen port.
FROM node:22-bookworm-slim

WORKDIR /app

# Ensure non-root node user owns workspace and data directory
RUN mkdir -p /data/ulisse && chown -R node:node /data/ulisse

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

COPY --chown=node:node . .
RUN npm run build

ENV AGENT_HOST=0.0.0.0
ENV PORT=5200
EXPOSE ${PORT}

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 5200) + '/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "server/index.mjs"]
