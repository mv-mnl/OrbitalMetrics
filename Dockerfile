# Stage 1: Build the Vite frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build the Node.js backend
FROM node:18-alpine
WORKDIR /app/backend
COPY backend/package.json ./
RUN npm install --production
COPY backend/ ./

# Copy built frontend into the backend's public directory
COPY --from=frontend-builder /app/frontend/dist ./public

# Expose port and start
EXPOSE 3000
CMD ["node", "server.js"]
