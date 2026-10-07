FROM node:22-alpine AS builder

WORKDIR /workspace

RUN npm install --global pnpm@10.34.6

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages ./packages
COPY pos-ui ./pos-ui
COPY infrastructure/api/checkout-command-hash-v1.json ./infrastructure/api/checkout-command-hash-v1.json

WORKDIR /workspace/pos-ui
RUN pnpm install --frozen-lockfile

ARG VITE_BASE=/
ENV VITE_BASE=$VITE_BASE
RUN pnpm run build

FROM nginx:alpine

COPY pos-ui/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/pos-ui/dist /usr/share/nginx/html

EXPOSE 80
