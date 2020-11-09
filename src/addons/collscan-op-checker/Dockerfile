FROM node:lts-alpine3.12

WORKDIR /collscan-op-checker

COPY package.json .

RUN npm install

COPY . .

ENTRYPOINT ["node", "src/addons/collscan-op-checker/index.js"]