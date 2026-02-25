FROM node:18-alpine AS builder

WORKDIR /app

# Install native dependencies for Prisma
RUN apk add --no-cache openssl python3 make g++

COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for build)
RUN npm ci

COPY . .

# Generate Prisma client and build TypeScript
RUN npx prisma generate
RUN npm run build

# --- Production Stage ---
FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

# Install only production dependencies
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist
# Copy generated Prisma client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000

# Run migrations and start server
CMD npx prisma migrate deploy && npm start
