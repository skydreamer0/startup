FROM node:20-alpine AS builder

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages ./packages
COPY admin-ui ./admin-ui

WORKDIR /workspace/admin-ui
RUN pnpm install --frozen-lockfile
RUN pnpm run build

FROM nginx:alpine

COPY admin-ui/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/admin-ui/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
