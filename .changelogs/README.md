# Release Changelogs

This directory contains detailed release notes for each version of EscapeMint. These files are used by the GitHub Actions release workflow to create rich, user-friendly release descriptions.

## Structure

Each version has its own markdown file following the naming convention:

```
v{major}.{minor}.{patch}.md
```

Examples:
- `v0.9.0.md`
- `v0.8.0.md`
- `v0.7.0.md`

## Format

Each changelog file should follow this structure:

```markdown
# Release v{version} - {Descriptive Title}

Released: YYYY-MM-DD

## Overview

A brief summary of the release, highlighting the main theme or most important changes.

## 🎉 New Features

### Feature Category 1
- Feature description with technical details
- Another feature in this category

### Feature Category 2
- More features...

## 🐛 Bug Fixes

### Fix Category
- Description of what was fixed
- Impact and technical details

## 🔧 Improvements

### Improvement Category
- What was improved
- Why it matters

## 🗑️ Removed

### Deprecated Features
- What was removed
- Why it was removed

## 📦 Installation

\`\`\`bash
git clone https://github.com/atomantic/EscapeMint.git
cd EscapeMint
npm run setup
npm run dev
\`\`\`

## 🔗 Full Changelog

**Full Diff**: https://github.com/atomantic/EscapeMint/compare/v{prev}...v{current}
```

## Workflow Integration

The GitHub Actions release workflow (`.github/workflows/release.yml`) automatically:

1. Checks for a changelog file matching the version in `package.json`
2. If found, uses it as the GitHub release description
3. If not found, falls back to generating a simple changelog from git commits

## Creating a New Changelog

When working on a new release:

1. **During Development**: Add notes to `CHANGELOG.md` under the "Unreleased" or current version section
   - Follow the format in `CLAUDE.md`: update CHANGELOG.md when making features and bug fixes

2. **Before Merging to Main**: Create a detailed changelog file:
   ```bash
   # Copy the template or an existing changelog
   cp .changelogs/v0.9.0.md .changelogs/v{new-version}.md

   # Edit the new file with your release notes
   # Update: version number, release date, features, fixes, etc.
   ```

3. **Update Root CHANGELOG.md**: Add a condensed version to the root `CHANGELOG.md` for easy reference

4. **Commit the Changelog**: Include the changelog file in your final PR:
   ```bash
   git add .changelogs/v{new-version}.md CHANGELOG.md
   git commit -m "docs: add changelog for v{new-version}"
   ```

## Best Practices

### ✅ Do:
- Use clear, descriptive section headings
- Group related changes together
- Include technical details where helpful
- Explain the "why" not just the "what"
- Use emoji section headers for visual organization (🎉 ✨ 🐛 🔧 🗑️ 📦)
- Link to relevant documentation or issues
- Include upgrade instructions for breaking changes
- Highlight security improvements

### ❌ Don't:
- Use vague descriptions like "various improvements"
- Include internal implementation details users don't care about
- Repeat the same information in multiple sections
- Use raw commit messages without context
- Forget to update the release date
- Leave placeholder or TODO content

## Examples

See existing changelog files for examples:
- `v0.9.0.md` - Major feature release (M1 Margin Borrowing)
- `v0.8.0.md` - Test infrastructure release
- `v0.7.0.md` - Mobile UI and chart improvements
- `v0.6.0.md` - Large multi-feature release (Derivatives)

## Maintenance

### Updating Past Releases

If you need to update a past release's changelog:

1. Edit the `.changelogs/v{version}.md` file
2. Update the GitHub release manually:
   ```bash
   gh release edit v{version} --notes-file .changelogs/v{version}.md
   ```

### Consistency Check

Periodically verify that:
- All tagged releases have corresponding changelog files
- Root `CHANGELOG.md` is in sync with `.changelogs/` directory
- Release dates match git tag dates
- Links to full diffs are correct

## Tools

### Generate Coverage Report
After creating a changelog, you can verify test coverage:
```bash
npm run test:coverage-report
```

### View Release on GitHub
```bash
gh release view v{version}
```

### Edit Release Notes
```bash
gh release edit v{version} --notes-file .changelogs/v{version}.md
```
