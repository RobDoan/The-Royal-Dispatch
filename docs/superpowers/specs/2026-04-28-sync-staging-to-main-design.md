# Design: Sync Staging to Main with Filter

**Date:** 2026-04-28
**Topic:** GitHub Action for Staging-to-Main Sync

## Goal
Automate the process of syncing the `staging` branch (main development branch) to the `main` branch (production branch) whenever a Pull Request is merged into `staging`. The sync must filter out specific development and documentation folders and result in a single squash commit on `main`.

## Requirements
- Trigger when a PR is merged into `staging`.
- Squash merge `staging` into `main`.
- Filter out: `.agents`, `.claude`, `docs/superpowers`, `docs/specs`, `docs/blogs`.
- Commit message format: `PR Title (#PR_NUMBER)`.
- Use a GitHub Action workflow.

## Architecture
The workflow will run on GitHub-hosted runners and use the `GITHUB_TOKEN` for authentication.

### Workflow: `sync-to-main.yaml`
1. **Trigger**: `pull_request` on `staging` with type `closed`.
2. **Condition**: Only run if `github.event.pull_request.merged == true`.
3. **Steps**:
    - **Checkout**: Fetch `main` and `staging`.
    - **Git Config**: Set bot user.
    - **Merge**: `git merge --squash staging`.
    - **Filter**: `git rm -rf --ignore-unmatch .agents .claude docs/superpowers docs/specs docs/blogs`.
    - **Commit**: `git commit -m "${{ github.event.pull_request.title }} (#${{ github.event.pull_request.number }})"`.
    - **Push**: `git push origin main`.

## Success Criteria
- Merging a PR to `staging` automatically updates `main`.
- `main` does not contain the filtered folders.
- `main` history shows clean squash commits with PR titles.
