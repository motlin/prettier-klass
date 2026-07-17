---
description: Sync tool versions from this template to sibling TypeScript projects
argument-hint: [project-name|all]
---

# TypeScript Template Sync

This project is the source of truth — a working exemplar — for TypeScript/Node
project configuration. Syncing a sibling means making its config files match this
template's.

Template path: !`pwd`

## The rule

Copy the template's config files into the sibling **nearly verbatim**. Only two
things are allowed to differ:

1. **Placeholders** — project `name`, `version`, `description`, the application's
   own dependencies and `justfile` recipes, per-project ignore lists, and
   `pnpm-workspace.yaml` `allowBuilds` entries (each is a per-project security
   decision — never copy one in without checking the sibling's dependency tree).
2. **Blocks labelled `TEMPLATE-SPECIFIC`** — these exist only because the template
   has no application source (e.g. the `ignoreDependencies` block in
   `.fallowrc.json`). Drop them from siblings.

Everything else — tool versions, hooks, workflows, lint and tool config — is meant
to be identical. When in doubt, copy it.

## Managed files

`.mise/config.toml`, `package.json`, `pnpm-workspace.yaml`, `.pre-commit-config.yaml`,
`.github/workflows/*.yml`, `justfile`, `.fallowrc.json`, `.markdownlint.jsonc`,
`.markdownlint-cli2.jsonc`, `.yamllint.yaml`, `scripts/configure-github.sh`.

A sibling not yet on Vite+ needs two prerequisite tasks before any others: add
`"npm:vite-plus"` to `.mise/config.toml`, then run `vp migrate`.

## Stale and conflicting tool configs

Siblings synced from older template versions may carry config files for tools the
template no longer uses. These conflict with the current toolchain (e.g. a leftover
Prettier config fighting oxfmt over formatting). In each sibling, scan for configs
belonging to tools the template does not use, including hidden dotfiles:

- **Formatting (template uses oxfmt):** `.prettierrc*` (`.prettierrc`,
  `.prettierrc.json`, `.prettierrc.json5`, `.prettierrc.yaml`, `.prettierrc.js`, …),
  `.prettierignore`, `prettier.config.*`, a `prettier` key in `package.json`,
  `.editorconfig` rules that contradict oxfmt.
- **Linting (template uses oxlint):** `biome.json`, `biome.jsonc`, `.eslintrc*`,
  `eslint.config.*`, `.eslintignore`, `tslint.json`.
- **General:** any other dot-config, `package.json` script, devDependency, or
  pre-commit hook referencing a tool the template has dropped.

A quick scan: `ls -a` the sibling root and compare every tool config against the
template's file list; anything the template lacks is suspect.

**Never delete these proactively.** They may be intentional per-project choices.
Instead, alert the user: list each suspect file in the sync report and generate a
task that names the file, explains the conflict (e.g. "stale Prettier config
conflicts with oxfmt"), and asks the user to confirm removal.

## Default git test

Each sibling must have a `default` git test registered so `j test-branch` works.
Run `git test list` in the sibling — the command must match the template's:

```
just --global-justfile _check-local-modifications && (should-skip-commit || just precommit) && just --global-justfile _check-local-modifications
```

If missing or different, generate a task to register it:

```
git test add --test default 'just --global-justfile _check-local-modifications && (should-skip-commit || just precommit) && just --global-justfile _check-local-modifications' --forget
```

## Workflow

`$ARGUMENTS` is a project name, `all`, or empty (treated as `all`). Read the sibling
list from `.llm/sync-projects.md` (gitignored, machine-specific).

1. **Refresh the template.** Check for newer tool versions (`mise ls-remote`,
   `npm outdated`) and update the template first if it is behind.
2. **Pull from siblings.** If a sibling has something newer or better than the
   template, ask the user, update the template, then propagate.
3. **Scan for stale configs.** For each sibling, run the stale-config scan above
   before generating tooling tasks. Alert on findings; do not delete.
4. **Generate tasks.** For each sibling, compare against the template and write
   tasks into its `.llm/todo.md` that bring each out-of-sync file in line.

**Stale task removal:** every sync task ends with a `Source: ~/projects/typescript-template`
line. Before appending, remove existing task blocks containing that marker; leave
all other tasks untouched.

## Task format

One task per out-of-sync file. Name the file, say to match the template, end with
the `Source:` line. Tasks with prerequisites (anything depending on `vp migrate`)
must say so.

```
- [ ] Sync .pre-commit-config.yaml with the template
      Match ~/projects/typescript-template/.pre-commit-config.yaml.
      Keep project-specific excludes.
      Source: ~/projects/typescript-template
```

## Report

After syncing, report: template versions and any template updates made; anything
pulled in from siblings; number of siblings synced and tasks created; and every
stale or conflicting tool config found, per sibling, with a note that the user
should confirm removal.
