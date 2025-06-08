FROM node:18-alpine

WORKDIR /app

# Install necessary build tools
RUN apk add --no-cache python3 make g++

# Copy package.json files
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install dependencies with detailed logs
RUN npm install
RUN cd client && npm install
RUN cd server && npm install
RUN cd ..

# Copy the rest of the application
COPY . .

# Build client separately with verbose output
RUN cd client && npm run build-only && cd ..

# Build server separately
RUN cd server && npm run build && cd ..

# Verify files exist after build
RUN ls -la client/dist/
RUN ls -la server/dist/

# Set environment variable
ENV NODE_ENV=production
ENV PORT=8080

# Expose the port
EXPOSE 8080

# Start the application
CMD ["npm", "run", "start:prod"] 