FROM oven/bun:1.4.1 AS dependencies
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile

FROM node:24.16.0-bookworm-slim AS development
WORKDIR /app
COPY --from=dependencies /app /app
WORKDIR /app/apps/web
EXPOSE 45173
CMD ["node", "node_modules/next/dist/bin/next", "dev", "--hostname", "0.0.0.0", "--port", "45173"]

FROM development AS build
ENV NEXT_TELEMETRY_DISABLED=1
RUN node node_modules/next/dist/bin/next build

FROM node:24.16.0-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=45173
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 45173
CMD ["node", "apps/web/server.js"]
