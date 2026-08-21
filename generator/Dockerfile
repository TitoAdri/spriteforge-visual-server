FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
EXPOSE 3002
CMD ["node", "--experimental-sqlite", "src/server.mjs"]
