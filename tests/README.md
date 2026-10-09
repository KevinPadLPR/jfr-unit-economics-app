# Playwright smoke tests

Read-only end-to-end smoke suite for the vanilla-JS dashboard, run against the
real JFR Ranch Supabase project (there is no staging environment). Signs in
once as a real, already-used, read-only `accountant`-role account and asserts
each ported page renders its key content without an error banner. No spec
ever clicks a write/save/delete control.

## Setup

```bash
npm install -D @playwright/test   # package.json already declares this devDependency
npx playwright install chromium
```

## Credentials

Deliberately **not** committed to the repo. Set these two environment
variables before running the suite (the email is the known test account;
get the password the same way anyone on the team would -- it is not written
down in this repo):

```bash
export TEST_ACCOUNTANT_EMAIL=ryan@longpointresources.com
export TEST_ACCOUNTANT_PASSWORD=...   # ask for it, don't hardcode it here
```

(PowerShell: `$env:TEST_ACCOUNTANT_EMAIL = "..."`, `$env:TEST_ACCOUNTANT_PASSWORD = "..."`.)

## Running

```bash
npx serve . -l 4173      # one terminal -- serves the static site
npx playwright test      # another terminal -- playwright.config.js also
                         # auto-starts this same `serve` command if nothing's
                         # already listening on 4173
```
