# Pusula — YKS University Explorer

[Open Pusula](https://unipusulam.com) · Turkish and English interface

Pusula helps students explore university programs in Türkiye using published YÖK Atlas placement data. It brings program search, historical rankings, last-placed-student net breakdowns, saved choices, student reviews, and an AI preference advisor into one place.

## What you can do

- Search programs by department, score type, city, university type, and teaching language.
- Compare placement rankings and scores across the 2022–2025 placement years.
- View the published subject-net breakdown for the last student placed in a program.
- Enter your own ranking to make the result list easier to interpret.
- Save interesting programs in your browser and return to them later.
- Read anonymous student ratings and moderated written reviews.
- Ask the AI advisor for a grounded shortlist based on your interests and preferences.

## How to use Pusula

1. Choose one or more programs and optionally add your YKS ranking, preferred cities, university type, or teaching language.
2. Select **Explore programs** to load matching results.
3. Open a result to see historical placement data, net breakdowns, language requirements when available, and student reviews.
4. Save useful programs with the heart button or ask the AI advisor to help compare options.

## Data and privacy

Placement data and net breakdowns come from [YÖK Atlas](https://yokatlas.yok.gov.tr/). Pusula is an independent project and is not affiliated with YÖK, ÖSYM, or any university.

Saved programs and interface preferences stay in your browser's local storage. Anonymous review ratings are stored by Pusula; written reviews are held for moderation before publication. If you use the AI advisor, the profile details and messages you submit are sent to the Pusula server and OpenAI to generate a reply. Pusula does not save advisor conversations, and OpenAI response storage is disabled for these requests.

When analytics is configured, Pusula sends limited anonymous interaction events to PostHog. Entered rankings, review text, advisor messages, automatic click capture, persistent analytics identifiers, user profiles, and session recordings are not collected by the analytics configuration.

Do not include names, phone numbers, email addresses, or other sensitive information in reviews or advisor messages.

## Important limitations

Pusula is a research and comparison tool, not an official preference guide or a guarantee of admission. Rankings, quotas, program codes, special conditions, and rules can change. Always verify your final choices in the current [ÖSYM](https://www.osym.gov.tr/) guide and on official university websites.

Language-test information describes preparatory-school exemption requirements, not YKS admission requirements. Student reviews are subjective and are not official data. AI responses can be incomplete or mistaken even when they cite sources.

## Run the project locally

Requirements: Node.js 22 and npm.

```bash
npm install
cp .env.example .env
npm run dev
```

The website runs at `http://localhost:5173` and the local API at `http://localhost:8787`. University search works without an OpenAI key; the advisor requires a server-side `OPENAI_API_KEY` in `.env`.

Useful commands:

```bash
npm test
npm run lint
npm run build
```

Never put the OpenAI key in a `VITE_` variable or commit an `.env` file. Firebase deployments bind `OPENAI_API_KEY` from Secret Manager; copy `functions/.env.example` to a project-specific local env file only when deployment configuration requires it.

## Contributing and security

Bug reports and focused pull requests are welcome. For a suspected vulnerability, follow [SECURITY.md](SECURITY.md) and do not publish exploit details or credentials in a public issue.

## Source availability

This repository is publicly viewable, but no open-source license has been granted. Unless a license is added later, the default copyright rules apply.
