# Aura in one container: the Node server (it runs TypeScript directly), the built web app and the
# generated content library. Everything people create (accounts.db, and one folder per world with
# its database and uploads) lives in /data: mount a persistent disk or volume there.
# Deploy steps: DEPLOY.md.

# 1. Build the web app (this needs the dev dependencies: Vite, Tailwind, TypeScript).
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# 2. The server: production dependencies, the server code, the content and the built web app.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    AURA_DATA_DIR=/data \
    AURA_HOST=0.0.0.0 \
    PORT=8790
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY shared ./shared
COPY content ./content
COPY --from=build /app/dist ./dist
RUN mkdir -p /data

EXPOSE 8790
# Hosting platforms may set PORT; the check asks the running server whether it is up.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.AURA_PORT || process.env.PORT || 8790) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server/index.ts"]
