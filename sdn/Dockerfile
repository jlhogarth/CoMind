FROM node:24-bookworm-slim
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY sdn/src ./src
USER node
ENV PORT=3100
EXPOSE 3100
CMD ["node", "src/index.mjs"]
