# Contributing

Deutsche Fassung: [CONTRIBUTING.de.md](CONTRIBUTING.de.md)

Contributions are welcome: bug reports, suggestions and pull requests. This document
describes how development works.

## Development environment

```bash
git clone https://github.com/NextPad/NextPad.git
cd NextPad
bash web/build.sh          # editor and whiteboard bundles, needed before the first Rust build
cd server
cargo build
```

The editor in `web/` is built with pnpm (see `web/README.md`); the result
(`editor.js`, `editor.css`) is embedded into the server from `server/static/`.
`web/build.sh` copies the sources to `~/.cache/nextpad-web` and builds there, so the
project folder may sit on a `noexec` mount. After changing anything in `web/src/`, run
`web/build.sh` again and commit the rebuilt files in `server/static/` with your change.

## Tests and checks

```bash
bash web/build.sh
cd server
cargo test                         # unit tests
cargo clippy --all-targets -- -D warnings
cargo build                        # program for the browser tests
cd ..
bash web/test/browsertests.sh      # browser and API tests against freshly started servers
cd server && cargo build --release # release binary with LTO, stripped
```

`web/test/browsertests.sh` starts four servers with an empty data folder (main server,
LTI with a simulated platform, add-on server, appearance settings) and runs the tests in
`web/test/` with Playwright (Chromium): API, sync, timeline, restoring, editor, guests,
start page, languages, idea collection, quiz, buzzer, whiteboard, LTI, add-ons. The first
argument is the path to the program (default `server/target/debug/nextpad`); further
arguments select single tests. Once beforehand: `pnpm exec playwright install chromium` in
the build folder of `web/build.sh`. Every test exits with code 1 when a check fails. Load,
accessibility and pilot tests (`belastung*`, `a11y-*`, `ltipilot`, `remotetest`) are run
by hand.

The CI (`.github/workflows/ci.yml`) builds the server and runs `cargo test`, clippy with
`-D warnings`, `cargo audit` and the same test script. If a browser test fails, server
logs and test output are attached to the run as the artifact `browsertests`.

## Conventions

- Commit messages in English, imperative, no full stop at the end ("Keep indentation when
  restoring"). Below it, short points: what and why.
- No secrets, credentials or pad contents in the repository. What is ignored is listed in
  `.gitignore`.
- Everything people read in NextPad exists in German and English: texts belong in
  `server/src/texte/de.rs` and `en.rs` (or the catalogues of an add-on), never directly
  in the code. A unit test checks that both languages have the same keys and placeholders.
- Documents for people outside the project come in both languages: `X.md` in English,
  `X.de.md` in German, linked to each other and kept in step.
- New functionality comes with evidence (a test or a measurement) and an entry in
  `CHANGELOG.md`.

## Pull requests

This GitHub repository is published from a separate main repository. A pull request is
therefore not merged here; its commit is applied to the main repository with you as the
author and arrives here with the next release, which closes the pull request.

## Security reports

See [`SECURITY.md`](SECURITY.md).
