# Pusula — YKS University Explorer

Pusula searches the live YÖK Atlas catalog, compares four placement years, and loads the last placed student's published subject-net breakdown on demand.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The API proxy runs on port `8787`.

## Production

```bash
npm run build
npm start
```

## Firebase deployment

The production site uses Firebase Hosting for the Vite build and a second-generation Cloud Function
for the Express API. Hosting rewrites `/api/**` to the function, so the browser and API stay on the
same origin.

Prerequisites:

- Enable billing (the Blaze plan) for the Firebase project. Second-generation functions require it.
- Authenticate once with `npm run firebase:login`.
- Select the intended project with `npx firebase use --add`.

Store the OpenAI API key in Firebase Secret Manager, then deploy:

```bash
npx firebase functions:secrets:set OPENAI_API_KEY
npm run deploy
```

For later releases, `npm run deploy` is the only command needed. It creates a fresh production build,
deploys both Hosting and the `api` function to the project selected in `.firebaserc`, suppresses verbose
Firebase request logging, and applies the local IPv4 DNS workaround only if this network needs it.

Do not create `functions/.env` with the production key. The `api` function is explicitly bound to the
`OPENAI_API_KEY` secret, runs in `europe-west3`, and has a maximum instance count to constrain runaway
cost. Also configure an OpenAI project budget and Google Cloud budget alerts.

After the first deployment, connect the Squarespace-managed domain from Firebase Console under
Hosting > Add custom domain. Copy the exact records Firebase shows into Squarespace DNS; do not guess
the A, TXT, or CNAME values. Keep the default `web.app` address available until DNS and the managed
TLS certificate show as connected.

## University advisor

The advisor uses OpenAI's Responses API with GPT-5.6 Luna at medium reasoning effort. University
cards and placement figures always come from the same YÖK Atlas data used by the main search.
The model can use web search for current university details and returns its web sources separately.

Add your server-side API key to `.env`:

```bash
OPENAI_API_KEY=your_server_side_key
OPENAI_MODEL=gpt-5.6-luna
OPENAI_REASONING_EFFORT=medium
```

Keep the key on the server. Never expose it through a `VITE_` environment variable or browser code.
The advisor endpoint returns a clear configuration error until `OPENAI_API_KEY` is set.

### Production security

Run the deployed server with `NODE_ENV=production` and set `APP_ORIGIN` to the public website origin
(for example `https://pusula.example`).
The server rejects production advisor requests from other browser origins and applies both per-IP and
global in-memory request limits. Adjust `ADVISOR_IP_LIMIT` and `ADVISOR_GLOBAL_HOURLY_LIMIT` if needed.
If the app runs behind a trusted reverse proxy, set `TRUST_PROXY=1` so per-IP limits see the visitor's
address. Leave it unset when the Node server is directly exposed.

Also set an OpenAI project budget/usage alert: application rate limits reduce abuse but cannot replace
an account-level spending cap, especially when several server instances are running. Never commit
`.env`; rotate the API key immediately if it is ever exposed in Git, browser code, logs, or screenshots.
Advisor profile and message data is sent to the server and OpenAI to generate the response. Pusula does
not persist it, and Responses API storage is disabled in the request with `store: false`.

Placement data and nets come from YÖK Atlas. The comparison window is 2025–2022 because 2026 placement data does not exist before the 2026 preference and placement cycle finishes. Language-test values are preparatory-school exemption requirements, not YKS admission requirements, and link to official university sources. Always verify final quotas, program codes, conditions, and preference rules in the official ÖSYM guide.
