# ---- Build stage ----
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ---- Production stage ----
FROM node:24-alpine
WORKDIR /app

RUN apk add --no-cache python3 py3-pip \
    && pip install --no-cache-dir pip-audit --break-system-packages

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
RUN mkdir -p input output
CMD ["node", "dist/index.js"]
