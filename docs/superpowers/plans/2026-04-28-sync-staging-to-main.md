# Sync Staging to Main Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a GitHub Action workflow to sync `staging` to `main` with directory filtering.

**Architecture:** A workflow file triggered on PR merge to `staging`, performing a filtered squash merge into `main`.

**Tech Stack:** GitHub Actions, Git.

---

### Task 1: Create Workflow File

**Files:**
- Create: `.github/workflows/sync-to-main.yaml`

- [ ] **Step 1: Write the workflow YAML**

```yaml
name: Sync Staging to Main

on:
  pull_request:
    branches:
      - staging
    types: [closed]

jobs:
  sync:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: main

      - name: Git Identity
        run: |
          git config --global user.name "github-actions[bot]"
          git config --global user.email "github-actions[bot]@users.noreply.github.com"

      - name: Merge Staging
        run: |
          git fetch origin staging
          git merge --squash origin/staging

      - name: Filter Directories
        run: |
          git rm -rf --ignore-unmatch .agents .claude docs/superpowers docs/specs docs/blogs

      - name: Commit and Push
        run: |
          git commit -m "${{ github.event.pull_request.title }} (#${{ github.event.pull_request.number }})"
          git push origin main
```

- [ ] **Step 2: Commit the workflow file**

```bash
git add .github/workflows/sync-to-main.yaml
git commit -m "ci: add sync staging to main workflow"
```

### Task 2: Verification (Manual/Simulation)

Since I cannot trigger a real GitHub Action in this environment, I will verify the logic locally by simulating the steps.

- [ ] **Step 1: Create a test branch and simulate merge**
- [ ] **Step 2: Check that directories are filtered**
- [ ] **Step 3: Cleanup test artifacts**
