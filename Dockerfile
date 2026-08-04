# Multi-stage build for frontend containerization
FROM node:18-alpine AS builder

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install dependencies including peer dependencies
RUN npm ci --legacy-peer-deps

# Copy rest of the code
COPY . .

# Run build
RUN npm run build

# Production stage using Nginx to serve static files
FROM nginx:alpine

# Copy built static files to Nginx default html folder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration if needed (e.g. for fallback routing)
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
