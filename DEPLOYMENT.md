# ChatAlap deployment

Use one Render Web Service whenever possible. It serves the Vite client, API, and Socket.IO from one domain.

Build command:

```text
npm ci && npm run build
```

Start command:

```text
npm start
```

Set these Render environment variables:

```text
NODE_ENV=production
MONGODB_URI=mongodb+srv://<username>:<url-encoded-password>@<atlas-cluster>/chatalap?retryWrites=true&w=majority
JWT_SECRET=<long-random-secret>
```

For separate frontend and backend services, also set `CLIENT_URL` on the backend to the frontend URL, and `VITE_API_URL` on the frontend to `https://<backend-domain>/api`. Redeploy the frontend after changing `VITE_API_URL`.

Before testing login, visit `/api/health`. It must report `database` as `connected`.

Never commit `.env`, MongoDB URLs, JWT secrets, or service-account credentials.
