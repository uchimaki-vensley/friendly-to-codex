FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=development

# Install dependencies first for better layer caching
COPY package.json package-lock.json* ./
RUN npm install

# Copy the rest of the app
COPY . .

EXPOSE 5173

# Ensure Vite binds to all interfaces inside container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
