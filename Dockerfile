# The backend: the phone server (the default command) and the API (docker-compose.yml runs it
# with a different command). Built and run by docker-compose.yml (docker compose up --build).
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# Install dependencies first, so this layer is reused when only the code changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY db ./db
# Saved messages are written to data/ (mounted from the host by docker-compose.yml).
RUN mkdir -p data && chown node:node data

USER node
EXPOSE 3000
# Settings come from the environment (docker-compose.yml passes .env in).
CMD ["node", "src/phone/server.js"]
