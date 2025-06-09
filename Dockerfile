FROM node:18-alpine AS builder

WORKDIR /app

# Install necessary build tools
RUN apk add --no-cache python3 make g++

# Copy package.json files
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install ALL dependencies instead of only production
RUN npm install
RUN cd client && npm install
RUN cd server && npm install

# Copy source files
COPY . .

# Build client with simpler command and memory limit
RUN cd client && export NODE_OPTIONS="--max-old-space-size=512" && npm run build

# Build server
RUN cd server && export NODE_OPTIONS="--max-old-space-size=512" && npm run build

# Verify the builds were successful
RUN ls -la client/dist/ || echo "Client build failed - directory missing"
RUN test -f client/dist/index.html || echo "WARNING: index.html not found in client/dist/"

RUN ls -la server/dist/ || echo "Server build failed - directory missing"
RUN test -f server/dist/index.js || echo "WARNING: index.js not found in server/dist/"

# Create production image with only what's needed
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm install --only=production

# Copy built client and server from builder stage
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose the port
EXPOSE 8080

# Start the application with node directly instead of npm
CMD ["node", "server/dist/index.js"] 