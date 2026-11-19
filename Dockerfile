# Shoallhell server (accounts, saves, co-op relay) plus the built game, for Fly.io.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# the version shown in the game (passed by: fly deploy --build-arg GAME_VERSION=...)
ARG GAME_VERSION=
ENV GAME_VERSION=${GAME_VERSION}
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY --from=build /app/dist ./dist
EXPOSE 3031
CMD ["node", "server/index.js"]
