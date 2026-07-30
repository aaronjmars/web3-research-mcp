# Releasing

Publishing to npm is automated by GitHub Actions
(`.github/workflows/publish.yml`) using npm **OIDC trusted publishing**. There is
no `NPM_TOKEN` secret; auth happens over OIDC and a provenance attestation is
attached to every release.

Any git tag matching `v*` triggers a publish of the version currently in
`package.json`. The `prepublishOnly` script builds `dist/` (via `tsc`) before the
publish runs.

## Cut a release

```
npm version patch   # or: minor / major
git push --follow-tags
```

That bumps `package.json`, creates the `vX.Y.Z` tag, and pushes it. CI then runs
`npm install` + `npm publish --provenance` on Node 24 (npm 11+ is required for
OIDC).

## Notes

- Trusted publisher is configured on npmjs.com (package Settings -> Trusted
  Publisher), pointing at this repo + `publish.yml`. If you rename the repo or the
  workflow file, update it there or publishes will start failing.
- Node 24 in CI is deliberate: OIDC trusted publishing needs npm >= 11.5, which
  Node 20 does not ship.
