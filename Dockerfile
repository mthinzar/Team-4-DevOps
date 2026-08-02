# ============================================================
#  FoodHub production image.
#
#  Multi-stage so the runtime layer carries only production
#  dependencies, and runs as the unprivileged `node` user.
# ============================================================

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app

# tini reaps zombies and forwards SIGTERM, so `docker stop` is graceful.
RUN apk add --no-cache tini

ENV NODE_ENV=production \
    PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .

# app.js creates this at boot; pre-create it so the non-root user can write.
RUN mkdir -p public/images/uploads && chown -R node:node /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/admin/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "app.js.typo"]
