FROM node:22-alpine AS dev
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

FROM node:22-alpine AS builder
WORKDIR /app
# VITE_API_URL is baked in at build time.
# Leave empty (default) to use relative /api/ URLs proxied by nginx.
# Set to https://api.yourdomain.com if your reverse proxy routes the backend separately.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
