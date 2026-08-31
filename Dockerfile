# =========================
# Build stage
# =========================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency files first for better Docker layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application source
COPY . .

# Build the Vite application
RUN npm run build


# =========================
# Production stage
# =========================
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copy dependency files
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy Express server
COPY server.js ./
COPY src ./src

# Copy the Vite production build
COPY --from=builder /app/dist ./dist

# Cloud Run listens on the PORT environment variable.
EXPOSE 8080

CMD ["node", "server.js"]