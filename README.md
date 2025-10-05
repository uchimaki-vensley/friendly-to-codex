# friendly-to-codex

Local dev with Docker (Vite + React + TypeScript)

Quick start (Windows PowerShell):

```powershell
# build and start the dev container
docker-compose up --build

# open the app in the browser:
# http://localhost:5173
```

Notes:
- This project uses Vite dev server on port 5173.
- Files are mounted into the container for live reload. If you prefer, run `npm install` locally and use `npm run dev` directly in VS Code.
- `docker-compose.yml` preserves `node_modules` in the container using a volume at `/app/node_modules` so bind-mounting the workspace does not hide dependencies.
- Vite is configured to bind `0.0.0.0`, use file-watching with polling inside Docker, and keep HMR on port `5173`.

Local (non-Docker) dev:

```bash
npm install
npm run dev
```

VS Code tips:
- Open the folder in VS Code and install recommended extensions (TypeScript, ESLint).
- You can run the dev server inside the container or locally. If using the container, use the Remote - Containers extension to attach.
