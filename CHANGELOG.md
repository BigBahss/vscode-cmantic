# Changelog
All notable changes to the `C-mantic` extension will be documented in this file.

## [Unreleased]
### Fixed
- `cmantic.addHeaderGuard` will now replace any illegal symbols found in the file name with an underscore when creating a `#define` name.
- Removed `cmantic.addDefinition` from appearing in the command palette as this is an internal command and would throw an error if invoked this way.
- Remove duplicate entries of `Refactor...` and `Source Action...` from appearing in the command palette.

## [0.1.0] - January 15, 2020
### Added
- `cmantic.switchHeaderSourceInWorkspace` command
- `cmantic.addDefinitionInSourceFile` command/code-action
- `cmantic.addDefinitionInCurrentFile` command/code-action
- `Refactor...` editor context menu for C/C++
- `Source Action...` editor context menu for C/C++
- `cmantic.createMatchingSourceFile` command/code-action
- `cmantic.addInclude` command/code-action
- `cmantic.addHeaderGuard` command/code-action
