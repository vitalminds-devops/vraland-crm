# syntax=docker/dockerfile:1

FROM node:22.20-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN node --version \
    && npm --version \
    && npm ci --verbose --no-audit --no-fund

FROM node:22.20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time. The
# docker-compose build arg only takes effect when the Dockerfile declares it;
# without this, Compose warns and discards the value.
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Database scripts, run by hand: docker build --target migrator -t vraland-crm-migrate .
FROM dependencies AS migrator
COPY . .
CMD ["npm", "run", "db:migrate"]

FROM node:22.20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs \
    && mkdir -p /app/.data/documents \
    && chown -R nextjs:nodejs /app/.data

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
