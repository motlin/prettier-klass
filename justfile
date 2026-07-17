# `just --list --unsorted`
[group('default')]
default:
    @just --list --unsorted

ci := env("CI", "")

# Install dependencies
[group('setup')]
install:
    {{ if ci != "" { "npm ci" } else { "npm install" } }}

# Run the linter
lint: install
    npx oxlint {{ if ci != "" { "--format github" } else { "--fix" } }}

# Type-check the project
typecheck: install
    npx tsc --noEmit -p tsconfig.json

# Run lint and type checks
check: install lint typecheck

# Build the project
build: install
    npm run build

# Run tests
test *args: install
    npm run test {{args}}

# Run pre-commit hooks on all files (same as CI's pre-commit job)
pre-commit: install
    pre-commit run --all-files

# Run all pre-commit checks
[arg("quick", long, value="true", help="Skip tests")]
verify quick="": check build pre-commit
    {{ if quick != "true" { "just test" } else { "true" } }}
    @echo "All pre-commit checks passed!"

# Deprecated alias for `verify`
[arg("quick", long, value="true", help="Skip tests")]
precommit quick="": (verify quick)
