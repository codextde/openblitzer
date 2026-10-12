FROM oven/bun:1-slim

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data

COPY server/package.json server/bun.lock ./
RUN bun install --frozen-lockfile --production
COPY server/tsconfig.json ./
COPY server/src ./src

RUN mkdir -p /data && chown bun:bun /data
USER bun
VOLUME /data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/v1/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["bun", "src/index.ts"]
