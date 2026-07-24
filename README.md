# Pusula — YKS University Explorer

[Open Pusula](https://unipusulam.com) · Turkish and English interface · Bright and dark themes

Pusula is an independent university-program explorer for YKS candidates in Türkiye. It combines current YÖK Atlas guide data, historical placement results, searchable preference filters, saved programs, student reviews, statistical ranking estimates, and an AI preference advisor in one responsive interface.

## Features

- Browse university programs immediately or narrow the list by department, score type, university, city, university type, teaching language, and minimum/maximum cutoff ranking.
- Search within university and city selectors, then sort results from best to worst or worst to best.
- Compare 2022–2025 cutoff rankings, scores, and published historical quotas.
- See the current 2026 guide quota separately from completed placement-year quotas.
- Review a program's four-year trend and a bounded 2026 statistical ranking estimate with a confidence label.
- View YÖK Atlas subject-net data for the last student placed in a program.
- Check available English-preparation exemption information from official university sources.
- Save programs locally and filter the result list to saved choices.
- Read anonymous university ratings and moderated written reviews.
- Ask the AI advisor for a YÖK-backed shortlist based on conversation context, ranking, program, teaching language, city, and university-type preferences.
- Switch between Turkish and English or bright and dark themes.

## How the data is presented

Placement rankings, scores, quotas, program codes, and net breakdowns come from [YÖK Atlas](https://yokatlas.yok.gov.tr/). Current guide quotas and completed placement-year quotas are kept separate so a newly published quota is not shown under the previous year.

The 2026 ranking estimate uses recent YÖK Atlas rankings, comparable programs, trend stability, and quota movement. Its displayed range is a planning aid—not an admission probability, official forecast, or placement guarantee. Actual results can change with exam performance, candidate demand, quotas, and program conditions.

Pusula is not affiliated with YÖK, ÖSYM, OpenAI, or any university. Always verify final preferences against the current [ÖSYM guide](https://www.osym.gov.tr/) and official university information.

## Using Pusula

1. Browse all programs or select one or more departments.
2. Optionally enter your ranking and refine the results by university, city, type, language, score type, or cutoff range.
3. Open a program to inspect historical placement data, quota history, the 2026 estimate, net breakdowns, language information, and reviews.
4. Save useful programs or ask the advisor for a concise shortlist and follow-up comparisons.

Fit labels such as **İddialı**, **Uygun**, and **Daha güvenli** compare the candidate ranking with published cutoff data. They do not express an admission probability or guarantee.

## Technology

- React 18 and Vite
- Express API on Firebase Functions (Node.js 22)
- Firebase Hosting and Firestore
- OpenAI Responses API with optional web search for current supporting information
- YÖK Atlas program, placement, quota, and net data
- Optional privacy-restricted PostHog analytics

## Run locally

Requirements: Node.js 22 and npm.

```bash
npm install
cp .env.example .env
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

The website runs at `http://localhost:5173` and the API at `http://localhost:8787`. Program search works without an OpenAI key. The advisor requires a server-side `OPENAI_API_KEY` in `.env`.

Useful commands:

```bash
npm run dev
npm test
npm run lint
npm run build
```

## Environment variables

Start from [.env.example](.env.example). Important values include:

- `OPENAI_API_KEY`: server-side key used only by the advisor.
- `OPENAI_MODEL` and `OPENAI_REASONING_EFFORT`: advisor model configuration.
- `APP_ORIGIN`: trusted production origins allowed to call the advisor.
- `VITE_PUBLIC_POSTHOG_KEY` and `VITE_PUBLIC_POSTHOG_HOST`: optional analytics configuration embedded at build time.
- Advisor and data rate-limit variables documented in the example files.

Never place `OPENAI_API_KEY` in a `VITE_` variable or commit an `.env` file. Firebase deployments bind the OpenAI key through Secret Manager.

## Deployment

The repository is configured to deploy the Vite build and Firebase backend together:

```bash
npm run firebase:login
npm run deploy
```

The deployment target is defined in `.firebaserc`, while hosting rewrites and security headers are defined in `firebase.json`. Production environment values should be configured before deployment; secrets must remain outside source control.

## Privacy and safety

- Saved programs, language preference, and theme preference remain in browser storage. Rankings entered into the search interface stay client-side unless the user submits them to the advisor as part of a message or candidate profile.
- Advisor profile details and chat messages are sent to the Pusula server and OpenAI to generate a response. Pusula does not save advisor conversations, and OpenAI response storage is disabled for these requests.
- Anonymous ratings are stored by Pusula. Written reviews are held for moderation before publication.
- When configured, analytics collect a limited set of anonymous interaction events. Rankings, advisor messages, review text, persistent user profiles, automatic click capture, and session recordings are excluded from the analytics configuration.

Do not include names, phone numbers, email addresses, or other sensitive information in reviews or advisor messages.

## Limitations

- Pusula is a research and comparison tool, not an official preference guide.
- Ranking estimates, fit labels, and AI responses can be incomplete or inaccurate and must not be the sole basis of a preference decision.
- Quotas, rankings, fees, scholarships, program codes, conditions, and regulations can change.
- Language information describes preparatory-school exemption requirements, not YKS admission requirements.
- Student reviews are subjective and are not official university data.

## Contributing and security

Bug reports and focused pull requests are welcome. For suspected vulnerabilities, follow [SECURITY.md](SECURITY.md) and do not publish credentials or exploit details in a public issue.

## Source availability

This repository is publicly viewable, but no open-source license has been granted. Unless a license is added later, default copyright rules apply.
