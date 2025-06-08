FROM node:18-alpine

WORKDIR /app

# Copy package.json files
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install dependencies
RUN npm run install:all

# Copy the rest of the application
COPY . .

# Build the application
RUN npm run build

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