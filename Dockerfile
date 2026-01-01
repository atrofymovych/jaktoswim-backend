# TODO: update to latest
# TODO: Starting October 8, 2024, https://clerk.com/changelog/2024-10-08-express-sdk
FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .
CMD [ "node", "index.js" ]