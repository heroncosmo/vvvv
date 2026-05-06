FROM node:20-bookworm-slim AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --no-fund

FROM node:20-bookworm-slim AS build

WORKDIR /app

ARG SUPABASE_URL=""
ARG SUPABASE_ANON_KEY=""
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
ARG PUBLIC_BASE_URL=""
ARG APP_URL=""
ARG VITE_PUBLIC_APP_URL=""
ARG PWA_VERSION=""
ARG VITE_PWA_VERSION=""

ENV NODE_ENV=production
ENV SUPABASE_URL=${SUPABASE_URL}
ENV SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
ENV PUBLIC_BASE_URL=${PUBLIC_BASE_URL}
ENV APP_URL=${APP_URL}
ENV VITE_PUBLIC_APP_URL=${VITE_PUBLIC_APP_URL}
ENV PWA_VERSION=${PWA_VERSION}
ENV VITE_PWA_VERSION=${VITE_PWA_VERSION}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN mkdir -p public
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/client ./client
COPY --from=build /app/shared ./shared
COPY --from=build /app/public ./public

RUN mkdir -p uploads attached_assets temp_audio logs

EXPOSE 5000

CMD ["node", "dist/index.js"]
