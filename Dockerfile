FROM node:22-alpine

WORKDIR /app

# Install GitHub CLI and git
RUN apk add --no-cache git github-cli

COPY package.json ./
COPY server.js ./
COPY public/ ./public/

ENV PORT=5000
EXPOSE 5000

CMD ["node", "server.js"]
