## ADDED Requirements

### Requirement: cram static assets SHALL be served from a CF Pages assetDir and verified on production

The 考前猜題 static assets (`cram.json` and the pre-generated A4 PDFs) SHALL be served from a directory covered by the `assetDirs` allowlist in `scripts/build-cf-pages-dist.mjs` — either by placing them under an already-allowlisted dir (e.g. `public/content/`) or by adding their new dir to the allowlist. Post-deploy verification SHALL `fetch()` each on the production host and assert it is served as its real content type (not the SPA `index.html` catch-all).

#### Scenario: cram assets are under an allowlisted assetDir
- **WHEN** the 考前猜題 static assets are placed for CF Pages
- **THEN** they SHALL reside under a directory present in `assetDirs` in `build-cf-pages-dist.mjs`, otherwise the CF Pages `_redirects` SPA catch-all would serve `index.html` (HTTP 200 + HTML) and the asset would be silently broken in production

#### Scenario: Production smoke asserts real asset delivery
- **WHEN** the change is deployed
- **THEN** a post-deploy check SHALL fetch `cram.json` and the PDF on the production host and assert the responses parse as the expected content type (not HTML)
