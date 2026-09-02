FROM node:22-slim

WORKDIR /app

COPY package.json ./
COPY src ./src

ENV PORT=8787
ENV TAILDOG_DB=/app/data/taildog.db

EXPOSE 8787

CMD ["node", "src/index.mjs"]
