FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
RUN npm run build
RUN npm prune --production

FROM node:20-alpine
WORKDIR /app
RUN addgroup -S mcp && adduser -S mcp -G mcp
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
USER mcp
EXPOSE 8080
CMD ["node", "dist/http-server.js"]
