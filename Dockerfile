FROM node:26-alpine
ENV NODE_ENV=production DATA_DIR=/data PORT=3000 TRUST_PROXY=1
WORKDIR /app
COPY package.json ./
COPY index.html sw.js manifest.webmanifest ./
COPY css ./css
COPY js ./js
COPY assets ./assets
COPY server ./server
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
