# Stufe 1: Oberfläche und Server bauen
FROM node:22-slim AS bau
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Stufe 2: nur das fertige Programm – ein Prozess für Oberfläche, Befehle und Abgleich
FROM node:22-slim
WORKDIR /app
COPY --from=bau /app/dist ./dist
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION NODE_ENV=production PORT=8000
EXPOSE 8000
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:8000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/server.mjs"]
