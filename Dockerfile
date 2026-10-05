# syntax=docker/dockerfile:1

# corepack respeta el campo "packageManager" del package.json, de modo que la
# imagen usa exactamente el mismo pnpm que genero el lockfile.
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

# --- Dependencias ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- Build. Tambien es la imagen que corre `prisma migrate deploy` ---
#
# Conserva node_modules entero y el CLI de Prisma, que las migraciones necesitan.
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# prisma.config.ts exige DATABASE_URL aunque `generate` no se conecte a nada.
# El resto del entorno se valida al arrancar, no al compilar: los valores de
# verdad llegan en tiempo de ejecucion, desde el .env del servidor.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN pnpm prisma generate
RUN pnpm build

# --- Dependencias de produccion ---
#
# Aparte de `deps` a proposito: aquella tiene las de desarrollo, que hacen falta
# para compilar y no para servir. Esta capa es la que viaja a la imagen final.
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# La poda va en la misma capa que la instalacion, no en una posterior: una capa
# nueva que borra archivos no encoge la imagen, porque la anterior los conserva.
#
# `prisma` (el CLI), su Studio, pglite y typescript llegan arrastrados como peer
# opcional de `@prisma/client`. En tiempo de ejecucion el cliente se conecta por
# un driver adapter y no toca ninguno: son ~125 MB de herramientas de desarrollo
# dentro de la imagen que atiende peticiones. Las migraciones no salen de aqui
# sino de la imagen `-migrate`, que conserva el CLI entero.
RUN pnpm install --frozen-lockfile --prod \
  && rm -rf node_modules/.pnpm/prisma@* \
            node_modules/.pnpm/@prisma+studio-core@* \
            node_modules/.pnpm/@electric-sql+pglite@* \
            node_modules/.pnpm/typescript@* \
            node_modules/prisma \
  && rm -rf "$(pnpm store path 2>/dev/null || true)"

# --- Runtime ---
#
# Sin CLI de Prisma ni tsx: un contenedor que atiende peticiones no tiene por
# que poder reescribir el esquema ni sembrar datos. De eso se encarga `migrate`,
# que corre una vez y termina.
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

RUN addgroup -S nodejs && adduser -S nestjs -G nodejs

COPY --from=prod-deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --chown=nestjs:nodejs package.json ./

USER nestjs
EXPOSE 3001
CMD ["node", "--enable-source-maps", "dist/main"]
