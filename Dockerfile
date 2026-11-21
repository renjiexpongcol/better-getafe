# =========================
# Build stage
# =========================
FROM node:22-alpine AS workspace

WORKDIR /app

# npm resolves the root lockfile against these workspace manifests.
COPY package*.json ./
COPY apps ./apps
COPY packages ./packages
COPY services ./services

FROM workspace AS builder

ARG VITE_WEBSITE_ANALYTICS_ENABLED=true
ENV VITE_WEBSITE_ANALYTICS_ENABLED=$VITE_WEBSITE_ANALYTICS_ENABLED

# Install dependencies
RUN npm ci

# Copy application source
COPY . .

# Build the Vite application
RUN npm run build


# =========================
# Production stage
# =========================
FROM workspace

ENV NODE_ENV=production

# Install production dependencies
RUN npm ci --omit=dev

# Copy Express server
COPY server.js ./
COPY server ./server
COPY database/migrations/postgresql ./database/migrations/postgresql
COPY scripts ./scripts
COPY src ./src

# Copy the Vite production build
COPY --from=builder /app/dist ./dist

# The hosting platform supplies the PORT environment variable.
EXPOSE 8080

CMD ["node", "server.js"]
