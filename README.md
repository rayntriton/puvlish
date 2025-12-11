# publishjs

An intelligent Deno-based CLI wizard that automates Git and package publishing workflows with zero manual configuration.

## ✨ What Makes publishjs Special

**publishjs is not just another publishing tool** - it's an **intelligent wizard** that guides you through the entire setup and publishing process, automatically handling edge cases that would normally require manual intervention:

- 🚀 **Zero Manual Setup**: Automatically initializes Git, creates remotes, configures authentication
- 🤖 **Smart Automation**: Detects missing configuration and fixes it automatically
- 🔐 **Seamless Authentication**: Auto-injects tokens from environment variables
- 📦 **Multi-Registry**: Supports both npm and JSR with validation and auto-fix
- 🔍 **Command Logging**: See exactly what's happening with detailed command output
- 🛡️ **Safe by Default**: Prompts for confirmation, dry-run mode, never destructive

## 🎯 Key Features

### Auto Git Initialization
- Detects if Git is installed
- Initializes repository if needed
- Creates smart `.gitignore` automatically
- Configures Git user (name and email)
- Creates initial commit
- Renames branch to `main`
- **All with interactive prompts**

### Auto Remote Creation
- Detects GitHub CLI (`gh`) and GitLab CLI (`glab`)
- Creates repository on GitHub/GitLab automatically
- Configures remote `origin`
- **Automatic initial push with upstream tracking**
- Supports both public and private repositories

### Intelligent Authentication
- **Auto-detects** `GITHUB_TOKEN`, `GITLAB_TOKEN` from environment
- **Automatically injects** tokens into HTTPS URLs
- Uses `git ls-remote` for reliable authentication checks (works with empty repos!)
- Falls back to helpful setup instructions if needed
- Supports both SSH and HTTPS workflows

### Auto Commit Management
- Detects uncommitted changes before publishing
- Shows clear summary of what will be committed
- Generates intelligent commit messages
- Prompts for user confirmation
- Never commits without asking

### JSR Support & Validation
- Validates `deno.json` configuration
- **Auto-fixes** common JSR configuration issues
- Validates package name format (`@scope/name`)
- Validates semver versions
- Checks `exports` field
- Verifies JSR_TOKEN is configured
- Provides step-by-step setup instructions

### Command Logging & Debugging
- **Logs every Git/CLI command executed** (in verbose mode)
- Shows working directory for each command
- Displays exit codes and errors
- **Automatically sanitizes sensitive data** (tokens, passwords)
- Perfect for debugging and learning

### Three Powerful Commands

1. **`publishjs`** - Main wizard for publishing
2. **`publishjs init`** - Guided project setup wizard
3. **`publishjs check`** - Diagnostic tool for your setup

## 📋 Requirements

- [Deno](https://deno.land/) 1.40 or later
- Git installed and available in PATH
- **Optional**:
  - `gh` CLI for GitHub automation
  - `glab` CLI for GitLab automation
  - npm (for publishing to npm registry)

## 🚀 Installation

### Run Directly (No Installation)

```bash
deno run --allow-read --allow-write --allow-run --allow-env \
  jsr:@tirio/publishjs
```

### Install Globally

```bash
deno install --allow-read --allow-write --allow-run --allow-env \
  -n publishjs \
  jsr:@tirio/publishjs
```

After installation, just run:
```bash
publishjs
```

### Compile to Binary

```bash
deno compile --allow-read --allow-write --allow-run --allow-env \
  -o publishjs \
  jsr:@tirio/publishjs
```

## 📖 Usage Guide

### First Time Setup (Recommended)

Start with the init wizard to set up your project:

```bash
publishjs init --verbose
```

The wizard will:
1. ✅ Check if Git is installed
2. ✅ Initialize Git repository (if needed)
3. ✅ Create remote repository on GitHub/GitLab (if needed)
4. ✅ Configure authentication automatically
5. ✅ Validate package registry configuration
6. ✅ Auto-fix JSR configuration issues

**Example output:**
```
🚀 publishjs init v0.1.0

Step 1: Git Setup
✓ Git is installed
⚠ This directory is not a Git repository.
? Would you like to initialize a Git repository now? (Y/n) › Yes
🔧 Running: git init
✓ Git repository initialized
🔧 Running: git add .
🔧 Running: git commit -m "Initial commit"
✓ Initial commit created
🔧 Running: git branch -M main
✓ Branch renamed to 'main'

Step 2: Remote Repository Setup
? Would you like to create a remote repository now? (Y/n) › Yes
? Select platform: › GitHub (using gh CLI)
? Repository name: › my-awesome-project
? Make repository private? (y/N) › No
🔧 Running: gh repo create my-awesome-project --source=. --public
✓ GitHub repository created
🔧 Running: git push -u origin main
✓ Successfully pushed main to origin

Step 3: Package Registry Configuration
✓ Found JSR: @tirio/my-awesome-project@1.0.0

Step 4: JSR Configuration
✓ JSR configuration is valid

✅ Setup Complete
Your project is ready for publishing!
```

### Publishing Workflow

Once your project is set up, publish with:

```bash
# Interactive mode - wizard will guide you
publishjs

# Publish specific branch
publishjs --branch main

# Create and publish a new tag
publishjs --create-tag v1.0.0

# Dry run first (see what will happen)
publishjs --dry-run --verbose
```

### Diagnostic Command

Check your setup anytime:

```bash
publishjs check --verbose
```

Shows:
- ✅ Git installation and repository status
- ✅ Remote repository configuration
- ✅ Authentication status
- ✅ Available package registries (npm/jsr)

## 🔐 Authentication Setup

### Automatic Token Injection (Recommended)

publishjs automatically uses tokens from your environment:

**For GitHub:**
```bash
export GITHUB_TOKEN=ghp_your_token_here
# or
export GH_TOKEN=ghp_your_token_here
```

**For GitLab:**
```bash
export GITLAB_TOKEN=glpat-your_token_here
# or
export GL_TOKEN=glpat-your_token_here
```

**For JSR:**
```bash
export JSR_TOKEN=jsrp_your_token_here
```

Then just run `publishjs` - tokens are automatically injected into remote URLs! 🎉

### Creating Tokens

**GitHub Token:**
1. Visit: https://github.com/settings/tokens/new
2. Give it a name (e.g., "publishjs")
3. Set expiration (recommended: 90 days)
4. Select scopes: `✓ repo` (Full control of repositories)
5. Click "Generate token"
6. Copy and export: `export GITHUB_TOKEN=ghp_...`

**GitLab Token:**
1. Visit: https://gitlab.com/-/profile/personal_access_tokens
2. Give it a name (e.g., "publishjs")
3. Select scopes: `✓ api`, `✓ write_repository`
4. Click "Create personal access token"
5. Copy and export: `export GITLAB_TOKEN=glpat-...`

**JSR Token:**
1. Visit: https://jsr.io/account/tokens
2. Create a new token
3. Copy and export: `export JSR_TOKEN=jsrp_...`

### SSH Authentication

Alternatively, use SSH keys:

```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "your_email@example.com"

# Add to SSH agent
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

# Add public key to GitHub/GitLab in settings
cat ~/.ssh/id_ed25519.pub
```

## 📦 Registry Configuration

### npm

Requires `package.json`:

```json
{
  "name": "my-package",
  "version": "1.0.0",
  "description": "My awesome package",
  "main": "index.js",
  "private": false
}
```

Login to npm:
```bash
npm login
```

### JSR (JavaScript Registry)

Requires `deno.json`:

```json
{
  "name": "@scope/package-name",
  "version": "1.0.0",
  "exports": "./mod.ts"
}
```

publishjs will **automatically validate and fix** common JSR configuration issues! ✨

## 🎓 Complete Workflow Example

Starting from an empty directory:

```bash
# 1. Initialize your project
mkdir my-project && cd my-project
echo 'export function hello() { return "world"; }' > mod.ts

# 2. Run the init wizard
publishjs init --verbose

# The wizard will:
# - Initialize Git ✓
# - Create .gitignore ✓
# - Make initial commit ✓
# - Rename branch to main ✓
# - Create GitHub repository ✓
# - Configure remote ✓
# - Push to GitHub ✓
# - Validate JSR config ✓

# 3. Create deno.json for JSR
cat > deno.json << EOF
{
  "name": "@tirio/my-project",
  "version": "0.1.0",
  "exports": "./mod.ts"
}
EOF

# 4. Commit the config
git add deno.json
git commit -m "Add JSR configuration"

# 5. Publish!
publishjs --create-tag v0.1.0 --verbose

# publishjs will:
# - Auto-commit any changes ✓
# - Create tag v0.1.0 ✓
# - Push tag to GitHub ✓
# - Publish to JSR ✓
```

## 🎯 Command-Line Options

```bash
# Branch/Tag Selection
publishjs --branch main              # Publish specific branch
publishjs --tag v1.0.0              # Publish existing tag
publishjs --create-tag v1.0.1       # Create and publish new tag

# Registry Control
publishjs --skip-registries         # Git only, no npm/JSR
publishjs --registry npm            # Publish only to npm
publishjs --registry jsr            # Publish only to JSR

# Safety & Debugging
publishjs --dry-run                 # Show what would happen
publishjs --verbose                 # Detailed command logging
publishjs --force                   # Force push (careful!)

# Remote Control
publishjs --remote upstream         # Use different remote name
```

## 🔍 Verbose Mode & Command Logging

Run with `--verbose` to see every command:

```bash
publishjs --verbose
```

**Example output:**
```
🔧 Running: git status --porcelain
   (in /home/user/my-project)
✓ Command succeeded
   output: M mod.ts

🔧 Running: git add .
✓ Command succeeded

🔧 Running: git commit -m "Update module"
✓ Command succeeded

🔧 Running: git push -u origin main
✓ Command succeeded
```

**Security:** Tokens are automatically hidden:
```
🔧 Running: git remote set-url origin https://***@github.com/user/repo.git
✓ Remote URL updated with authentication token
```

## 🛠️ Troubleshooting

### Authentication Issues

**Problem:** "Authentication failed" or "Permission denied"

**Solution:**
1. Check token is set: `echo $GITHUB_TOKEN`
2. Run with verbose: `publishjs --verbose`
3. Look for token injection message: `✓ Remote URL updated with authentication token`
4. Verify token has correct permissions

### JSR Configuration Issues

**Problem:** "JSR configuration has issues"

**Solution:**
Run `publishjs init` - it will automatically detect and fix:
- Missing or invalid package name
- Invalid version format
- Missing exports field

### Repository Creation Issues

**Problem:** "No CLI tools available (gh or glab)"

**Solution:**
Install GitHub CLI or GitLab CLI:
```bash
# GitHub CLI
brew install gh  # macOS
# or visit: https://cli.github.com/

# GitLab CLI
brew install glab  # macOS
# or visit: https://gitlab.com/gitlab-org/cli
```

### Git Not Initialized

**Problem:** "Not a Git repository"

**Solution:**
Run `publishjs init` and it will initialize Git for you!

## 🏗️ Development

```bash
# Clone repository
git clone https://github.com/tirio/publish-js.git
cd publish-js

# Run in dev mode
deno task dev

# Run tests
deno task test

# Type check
deno task check

# Lint code
deno task lint

# Format code
deno task fmt
```

## 📊 Project Statistics

- **13 TypeScript modules**
- **~4,500 lines of code**
- **60+ functions with logger support**
- **100% automatic token sanitization**
- **Zero npm dependencies** (Deno only!)

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run `deno task check` and `deno task fmt`
6. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Credits

Built with:
- [Deno](https://deno.land/) - Modern JavaScript/TypeScript runtime
- [Cliffy](https://cliffy.io/) - Command-line framework for Deno
- [Deno Standard Library](https://deno.land/std) - Official Deno standard modules

---

**Made with ❤️ by the publishjs team**

*Automate your publishing workflow. Focus on building great software.*
