# mastra-poc

## Desarrollo local

1. Backend:

```bash
cd backend
npm install
cp .env.example .env
npm run start:dev
```

El backend queda disponible en `http://localhost:3000/api`.

2. Frontend:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

En desarrollo el frontend usa `/api` y Vite lo proxyea al backend definido en
`VITE_API_PROXY_TARGET` (`http://localhost:3000` por defecto). Si desplegas el
frontend separado del backend, cambia `VITE_API_BASE_URL` por la URL absoluta de
la API, por ejemplo `https://api.example.com/api`.

Comando holístico para sincronizar el repo frontend-poc
```bash
git remote add frontend-poc https://github.com/performance-agent/perf-canvas-ui.git
git subtree add --prefix=frontend frontendpoc main --squash
```
