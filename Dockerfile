# Offizielles Node-Image statt Nixpacks, damit Sicherheitsupdates von Node
# bei jedem Build mit --pull automatisch übernommen werden.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Der Build prüft nur, ob die Variablen gesetzt sind, und baut sie nicht ein
# (geprüft). Echte Werte setzt Coolify zur Laufzeit; so landen keine
# Secrets in den Image-Layern.
RUN DB_HOST=build DB_PORT=3306 DB_USER=build DB_PASSWORD=build DB_NAME=build \
    ENCRYPTION_KEY=YnVpbGQtcGxhY2Vob2xkZXItbm90LWEtcmVhbC1rZXk= \
    npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/next.config.ts ./
USER node
EXPOSE 3000
CMD ["npm", "start"]
