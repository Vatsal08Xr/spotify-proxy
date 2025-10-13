FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install express node-fetch@2
COPY server.js .
EXPOSE $PORT
CMD ["node", "server.js"]
