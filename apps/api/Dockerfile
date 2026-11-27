FROM oven/bun:1.4.1 AS development
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
WORKDIR /app/apps/api
EXPOSE 45174
CMD ["bun", "--watch", "src/index.ts"]

FROM development AS build
RUN bun run build

FROM oven/bun:1.4.1 AS production
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production
USER bun
WORKDIR /app/apps/api
EXPOSE 45174
CMD ["bun", "dist/index.js"]
