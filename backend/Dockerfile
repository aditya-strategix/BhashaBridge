FROM node:18-slim
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN apt-get update -y && apt-get install -y openssl
RUN npm install
RUN npx prisma generate
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
