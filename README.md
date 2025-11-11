# publishjs

A Deno-based CLI tool for automating Git and package publishing workflows with interactive prompts and validation.

## Features

- 🔍 **Smart Detection**: Automatically detects Git setup, remote repositories, and package registries (npm/jsr)
- 🔐 **Authentication Verification**: Checks push permissions and provides setup instructions
- 📦 **Multi-Registry Support**: Publish to both npm and JSR registries
- 🎯 **Interactive Prompts**: Friendly CLI prompts when information is missing
- ✅ **Pre-flight Checks**: Validates all requirements before executing operations
- 🛡️ **Safe by Default**: Dry-run mode and confirmation prompts prevent accidents
- 🚀 **Zero Dependencies**: Built with Deno, no npm install required

## Requirements

- [Deno](https://deno.land/) 1.40 or later
- Git installed and available in PATH
- Optional: npm (for publishing to npm registry)

## Installation

### Run Directly

```bash
deno run --allow-read --allow-write --allow-run --allow-env \
  jsr:@rayn/publishjs
```

### Install Globally

```bash
deno install --allow-read --allow-write --allow-run --allow-env \
  -n publishjs \
  jsr:@rayn/publishjs
```

### Compile to Binary

```bash
deno compile --allow-read --allow-write --allow-run --allow-env \
  -o publishjs \
  jsr:@rayn/publishjs
```

## Usage

### Interactive Mode

Simply run `publishjs` without arguments to enter interactive mode:

```bash
publishjs
```

The tool will guide you through:
1. Git repository verification
2. Remote repository configuration
3. Authentication check
4. Branch/tag selection
5. Registry detection and selection
6. Final confirmation

### Command-Line Options

Publish a specific branch:
```bash
publishjs --branch main
```

Publish a specific tag:
```bash
publishjs --tag v1.0.0
```

Create and publish a new tag:
```bash
publishjs --create-tag v1.0.1
```

Skip package registry publishing (Git only):
```bash
publishjs --skip-registries
```

Dry run (see what would happen):
```bash
publishjs --dry-run
```

Force push (use with caution):
```bash
publishjs --branch main --force
```

Verbose logging:
```bash
publishjs --verbose
```

### Check Command

Diagnose your setup:

```bash
publishjs check
```

This will verify:
- Git installation
- Repository status
- Remote configuration
- Authentication
- Available registries

## Workflow

1. **Git Verification**: Checks if Git is installed and repository is initialized
2. **Remote Check**: Verifies remote repository is configured (provides setup instructions if not)
3. **Authentication**: Tests push permissions (guides through token/SSH setup if needed)
4. **Selection**: Prompts for branch/tag if not specified via CLI
5. **Registry Detection**: Finds npm and JSR package configurations
6. **Confirmation**: Shows summary and asks for confirmation
7. **Publishing**: Pushes to Git and publishes to selected registries

## Authentication

### SSH (Recommended)

```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "your_email@example.com"

# Add to SSH agent
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

# Add public key to GitHub/GitLab in settings
```

### HTTPS with Personal Access Token

**GitHub:**
1. Create token at https://github.com/settings/tokens/new
2. Select `repo` scope
3. Set as environment variable:
   ```bash
   export GITHUB_TOKEN=your_token_here
   ```

**GitLab:**
1. Create token at https://gitlab.com/-/profile/personal_access_tokens
2. Select `api` and `write_repository` scopes
3. Set as environment variable:
   ```bash
   export GITLAB_TOKEN=your_token_here
   ```

## Registry Configuration

### npm

Requires a `package.json` with `name` and `version` fields:

```json
{
  "name": "my-package",
  "version": "1.0.0",
  "private": false
}
```

Ensure you're logged in to npm:
```bash
npm login
```

### JSR

Requires a `deno.json` or `jsr.json` with `name` and `version` fields:

```json
{
  "name": "@scope/package-name",
  "version": "1.0.0",
  "exports": "./mod.ts"
}
```

## Examples

### Complete Release Workflow

```bash
# Check everything is set up
publishjs check

# Create and publish a new version
publishjs --create-tag v1.2.0

# Dry run first to see what will happen
publishjs --create-tag v1.2.0 --dry-run

# Then actually publish
publishjs --create-tag v1.2.0
```

### Git-Only Workflow

```bash
# Push main branch without publishing to registries
publishjs --branch main --skip-registries
```

### Emergency Hotfix

```bash
# Force push a hotfix (careful!)
publishjs --branch hotfix --force
```

## Troubleshooting

### "Git not installed"

Install Git from https://git-scm.com/downloads

### "Not a Git repository"

Run `git init` or let publishjs initialize it for you when prompted.

### "No remote repository found"

Add a remote:
```bash
git remote add origin https://github.com/username/repo.git
```

Or use GitHub CLI:
```bash
gh repo create --source=. --push
```

### "Push permissions check failed"

Set up authentication (see [Authentication](#authentication) section).

### "npm publish failed"

Ensure you're logged in:
```bash
npm whoami
npm login
```

### "JSR publish failed"

Check your `deno.json` configuration and ensure you have a JSR account.

## Development

```bash
# Clone the repository
git clone https://github.com/yourusername/publish-js.git
cd publish-js

# Run in development mode
deno task dev

# Run tests
deno task test

# Type check
deno task check

# Lint
deno task lint

# Format code
deno task fmt
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Credits

Built with:
- [Deno](https://deno.land/) - Modern JavaScript/TypeScript runtime
- [Cliffy](https://cliffy.io/) - Command-line framework for Deno
- [Deno Standard Library](https://deno.land/std) - Official Deno standard modules
