FROM node:lts-alpine3.12

WORKDIR /mdb-query-terminator

COPY package.json .

RUN npm install

COPY . .

ENTRYPOINT ["node", "src/index.js"]