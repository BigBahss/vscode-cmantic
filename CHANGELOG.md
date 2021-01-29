# Changelog
All notable changes to the `C-mantic` extension will be documented in this file.

## [Unreleased]
### Changed
- `cmantic.addHeaderGuard` will now validate static text given by the user in the `C_mantic.headerGuard.defineFormat` setting by replacing illegal symbols with underscores.
- `cmantic.createMatchingSourceFile` will now sort directory suggestions based on their similarity to the header file's directory. This means that the top directory in the list is most likely the directoy the user wants to put the new file in, and can just press enter.
- `cmantic.createMatchingSourceFile` will now look at the file extensions in the selected directory and automatically pick one when there is only one type of source file extension found.

### Fixed
- Improved performance of `cmantic.switchHeaderSourceInWorkspace` by caching header/source pairs after they are found.
- Improved performance of `Add Definition` commands/code-actions.
- Fixed where `cmantic.addInclude` places new includes in the case that the file has no existing include statements and is non-empty.

## [0.2.0] - January 22, 2021
### Added
- `cmantic.generateGetterSetter`, `cmantic.generateGetter`, and `cmantic.generateSetter` commands/code-actions.
- `cmantic.createMatchingSourceFile` can now generate namespace blocks. Configurations were added to customize this behavior.

### Changed
- `Curly Brace Format` for functions was split into separate configurations for C and C++.

### Fixed
- `cmantic.addHeaderGuard` will now replace any illegal symbols found in the file name with an underscore when creating a `#define` name.
- Removed `cmantic.addDefinition` from appearing in the command palette as this is an internal command and would throw an error if invoked this way.
- Remove duplicate entries of `Refactor...` and `Source Action...` from appearing in the command palette.
- Fixed issues pertaining to how the placement of new function definitions is determined.
- Fixed `Add Definition` not recognizing `operator` overload functions.
- Fixed `Add Definition` not placing function into a cooresponding namespace block when that block was empty.
- Various minor fixes.

## [0.1.0] - January 15, 2021
### Added
- `cmantic.switchHeaderSourceInWorkspace` command
- `cmantic.addDefinitionInSourceFile` command/code-action
- `cmantic.addDefinitionInCurrentFile` command/code-action
- `Refactor...` editor context menu for C/C++
- `Source Action...` editor context menu for C/C++
- `cmantic.createMatchingSourceFile` command/code-action
- `cmantic.addInclude` command/code-action
- `cmantic.addHeaderGuard` command/code-action
