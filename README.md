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

Placement data and nets come from YÖK Atlas. The comparison window is 2025–2022 because 2026 placement data does not exist before the 2026 preference and placement cycle finishes. Language-test values are preparatory-school exemption requirements, not YKS admission requirements, and link to official university sources. Always verify final quotas, program codes, conditions, and preference rules in the official ÖSYM guide.
