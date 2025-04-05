FROM node:23.10.0 as dev1

RUN apt-get update

RUN mkdir -p /usr/src/app

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

COPY ./src/utils/font/Avenir-Black.ttf ./dist/utils/font/Avenir-Black.ttf

RUN npm run build && npm cache clean --force

EXPOSE 5001

CMD ["npm", "run", "start"]