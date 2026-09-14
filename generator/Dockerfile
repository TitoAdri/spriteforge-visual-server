FROM node:22-alpine
RUN apk add --no-cache su-exec
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY src ./src
COPY docker-entrypoint.sh /usr/local/bin/spriteforge-generator-entrypoint
RUN chmod 755 /usr/local/bin/spriteforge-generator-entrypoint && mkdir -p /data
EXPOSE 3002
ENTRYPOINT ["/usr/local/bin/spriteforge-generator-entrypoint"]
