## What

<!-- What changed and why. Link the issue: "Closes #123". -->

## How it was tested

<!-- The test you wrote first (and saw fail), and the checks you ran. -->

## Checklist

- [ ] A test covers the change, and it fails without it
- [ ] `./scripts/dev npm run lint` and `./scripts/dev npm test` pass
- [ ] Docs in `projects/site/src/content/docs/` are updated if behaviour changed
- [ ] A changeset is added (`NGPDF_IMAGE=node:24-bookworm ./scripts/dev npm run changeset`) if `@ngpdf/core` changed
