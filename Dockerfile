FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install express node-fetch
COPY server.js .
EXPOSE $PORT
CMD ["node", "server.js"]
