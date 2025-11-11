# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**publishjs** is a Deno-based CLI tool for automating Git and package publishing workflows. It helps developers publish code to Git repositories (GitHub/GitLab) and package registries (npm/jsr) with interactive prompts and validation.

The tool is distributed via JSR and handles:
- Git repository verification and initialization
- Remote repository configuration
- Authentication key management
- Interactive branch/tag selection
- Publishing to npm and JSR registries

## Architecture

### Core Workflow (Main Execution Flow)

1. **Argument Parsing**: Parse CLI options vs. entering interactive mode
2. **Verification Phase**: Check Git, remote repository, and authentication
3. **Interactive Phase**: Prompt for branches/tags if not provided via CLI
4. **Detection Phase**: Identify npm/jsr registry configuration
5. **Publishing Phase**: Push to Git and optionally publish to registries

### Key Components (Planned)

The architecture should be modular with clear separation:

- **CLI Entry Point**: Command parsing and option handling
- **Git Module**: Git detection, operations, and status checking
- **Remote Module**: Remote repository detection and configuration
- **Auth Module**: Credential management and validation
- **Interactive Module**: User prompts for branches, tags, and decisions
- **Registry Module**: npm/jsr detection and publishing
- **Validation Module**: Pre-flight checks for all requirements

### Technology Stack (Deno)

This project uses Deno with the following dependencies:
- **@cliffy/command**: CLI argument parsing and command framework
- **@cliffy/prompt**: Interactive prompts (Select, Confirm, Input)
- **@std/fmt**: Terminal formatting and colors
- **@std/fs**: Filesystem operations
- **@std/path**: Path manipulation utilities
- **Deno.Command**: Execute Git and npm commands externally

## Development Commands

Deno doesn't require dependency installation. All commands are defined in `deno.json`:

```bash
# Run the CLI in development mode with all permissions
deno task dev

# Run tests
deno task test

# Type check all TypeScript files
deno task check

# Lint source code
deno task lint

# Format code
deno task fmt

# Check formatting without modifying
deno task fmt:check

# Run CLI directly with custom arguments
deno run --allow-read --allow-write --allow-run --allow-env src/cli.ts [args]

# Compile to standalone binary (for distribution)
deno compile --allow-read --allow-write --allow-run --allow-env -o publishjs src/cli.ts
```

## Implementation Guidelines

### Git Verification Strategy

- Check if Git is installed: Execute `git --version` with `Deno.Command`
- Check if directory is a Git repository: Check for `.git` directory using `@std/fs`
- If no Git: Prompt user to initialize with `git init` using interactive prompts

### Remote Repository Verification

- Check for remote: `git remote -v`
- If no remote: Guide user to create repository on GitHub/GitLab
- Suggest using `gh` CLI or `glab` CLI for quick repository creation
- Wait for user to complete `git remote add origin <url>` before proceeding

### Authentication Handling

- Detect if user can push (attempt `git push --dry-run` or check SSH/token configuration)
- If authentication fails: Guide user to create Personal Access Token (PAT)
- **Security**: Store tokens in environment variables, not in plain text
- Support both SSH keys and HTTPS with tokens

### Interactive Prompts

When branches/tags not specified via CLI:
- List local branches with `git branch` executed via `Deno.Command`
- List existing tags with `git tag` executed via `Deno.Command`
- Use `@cliffy/prompt` (Select, Confirm) to let user choose branch/tag to publish
- Validate selection before proceeding

### Registry Detection

- **npm**: Check for `package.json` with `name` field
- **jsr**: Check for `jsr.json` or `deno.json`
- Optionally publish to registries after Git push

### Error Handling Priorities

- Failed Git push (protected branches, conflicts)
- Missing credentials or expired tokens
- Network failures during API calls
- Invalid repository configurations
- Registry publishing failures

## Project Context

This project is implemented in **Deno** (TypeScript) and distributed via JSR. The PROMPTS.md file contains detailed Spanish-language requirements from the original architect describing the tool's purpose, workflow, and technical approach.

Key design principles from PROMPTS.md:
- **Validation before action**: Verify all requirements before executing operations
- **Progressive workflow**: Guide users through each step with clear instructions
- **Edge case handling**: Proactively identify and handle common failure scenarios
- **Interactive when needed**: Fall back to prompts when CLI arguments are insufficient
- **Secure by default**: Never store credentials in plain text, use environment variables

## Deno-Specific Notes

- **Permissions**: The tool requires `--allow-read`, `--allow-write`, `--allow-run`, and `--allow-env` permissions
- **External commands**: Git and npm are executed as external processes via `Deno.Command`
- **Publishing to JSR**: Use `deno publish` command natively
- **Publishing to npm**: Execute `npm publish` as external command
- **No build step**: TypeScript is executed directly by Deno runtime
- **Binary distribution**: Can be compiled to standalone binary with `deno compile`
