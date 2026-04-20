# Build stage
FROM node:24-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN corepack enable && corepack prepare pnpm@latest --activate && pnpm install --ignore-scripts

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Build the application
RUN pnpm run build

# Production stage
FROM node:24-alpine AS release

# Set working directory
WORKDIR /app

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

ENV NODE_ENV=production

# Install pnpm and production dependencies without running scripts
RUN corepack enable && corepack prepare pnpm@latest --activate && pnpm install --prod --ignore-scripts

# Command to run the application
CMD ["node", "dist/index.js"]