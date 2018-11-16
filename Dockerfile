FROM node:10

COPY . .

ENV STAGE=dev
ENV REGION=us-west-2
ENV AWS_ACCESS_ID=''
ENV AWS_SECCRET_KEY=''
ENV AWS_SESSION_TOKEN=''

CMD npm i && npm start -- export --stage $STAGE --region $REGION