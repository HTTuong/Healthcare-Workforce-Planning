# NestJS API. Build stage compiles TypeScript, the runtime stage applies the migrations and starts the API.
# Debian slim, not Alpine: the Prisma schema engine used by `migrate deploy` needs OpenSSL and glibc.
FROM node:24-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Dependencies first, so a code change does not reinstall them. postinstall runs `prisma generate`, which needs the
# schema and the config.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build
# Fetch the schema engine now, while building, so starting a container needs no download.
RUN npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > /dev/null

FROM node:24-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=3000
WORKDIR /app
# The full node_modules is kept on purpose: `prisma migrate deploy` and `npm run create-admin` (tsx) are dev
# dependencies. A smaller image would move them to dependencies; for a test environment the size is acceptable.
COPY --from=build /app /app
COPY --from=build /root/.cache /root/.cache
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --retries=20 CMD node -e "fetch('http://localhost:3000/').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
