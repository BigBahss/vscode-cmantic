# Changelog
All notable changes to the `C-mantic` extension will be documented in this file.

## [Unreleased]
### Added
- Added a setting `Case Style` to control whether getters and setters are generated with names in snake_case, camelCase, or PascalCase. (#11)

### Changed
- `volatile` qualifier will now be stripped from getter return types as it has no effect.

### Fixed
- Fixed setter generation for reference types. (#12)

## [0.4.1] - February 19, 2021
### Added
- Added support for `s_` static member naming scheme when generating getters and setters.
- Added settings to control what code-actions are suggested (light-bulb menu).
- Added a setting to control the verbosity of alerts that are shown (Information, Warning, Error).

### Changed
- Code-actions for generating getters and setters will now only be suggested when you select the name of the member variable.

### Fixed
- Fixed a bug where classes/structs defined within a class/struct could affect the placement of getters and setters.
- Fixed a bug where getters and setters could not be generated for static members on `clangd`.

## [0.4.0] - February 14, 2021
### Added
- Added `cmantic.moveDefinitionIntoOrOutOfClass` command/code-action. Additionally, definitions within classes can be moved to a matching source file. (#7)

### Changed
- `Add Definition` will no longer reveal existing definitions if `Reveal New Definitions` is turned off in the settings.

### Fixed
- Fixed a bug when determing the scope of a new function definition. Definitions were sometimes generated with namespaces prepended to their scope-string (namespace::class::functionName) even if the definition was being placed within the cooresponding namespace block.
- Fixed `Move Definition` not accounting for changes in scope at the target position. (#6)
- Parsing has been improved to accurately find matching parentheses, brackets, etc.
- Improved parsing of preprocessor directives.
- Raw string literals are now accounted for. This may have caused parsing issues before. (#8)
- Improved parsing of access specifiers when looking for a location for new getters and setters. Under some conditions, getters and setters may have been placed in non-public access.
- Improved smart-placement of function definitions.
- Implemented a workaround for `Add Definition` sometimes not revealing the new definition in the editor. (#2)
- Code-actions will no longer be suggested for deleted, defaulted, and pure virtual functions.

## [0.3.1] - February 08, 2021
### Added
- Added an Output channel to log info, warnings, and errors.
- Generating a setter will now recognize `enum` types and use a pass-by-value parameter type.
- Generating a setter can now resolve `typedef`'s and `type-alias`'s in order to determine if the parameter should be pass-by-value instead of pass-by-const-reference.
- Added an opt-in setting to resolve `typedef`'s, `type-alias`'s, and `enum`'s when generating setters because this may impact the performance of the command.

### Changed
- Changed the UI appearance of getter and setter commands and messages. This is to differentiate from languages that have 'get' and 'set' keywords.
- Changed incorrect usage of 'method' to 'member function'. This is a semantic change in order to match the C++ standard.

### Fixed
- Fixed a bug where member variables having an inline-block-comment would be recognized as being a pointer, and thus would generate a setter with a pass-by-value parameter type.
- Fixed a bug where having an `operator->` function defined/declared anywhere in the file would throw an exception (vscode notified of the error '`name must not be falsy`'). This bug also prevented code-actions from being provided for that file.
- Fixed placement of getter/setter definitions on `clangd` and `ccls`.
- Fixed a bug where a type with a pointer template parameter would generate a pass-by-value setter.
- Fixed a bug where a type with a const template parameter wouldn't allow generating a setter, because the whole type was being recognized as const.
- Fixed a bug where a type with a const template parameter would generate a getter with const stripped from the template parameters.

## [0.3.0] - February 05, 2021
### Added
- Added `cmantic.moveDefinitionToMatchingSourceFile` command/code-action. (#3)

### Changed
- Preemptively find header/source pairs to improve performance of commands.

### Fixed
- Fixed generated getter/setter placement in the case that the relative declaration is multi-lined.
- Fixed smart-placement of function definitions on Windows.
- Fixed 'Auto' namespace body indentation for `Add Definition` in an empty namespace.
- Fixed placement of new accessor declarations for `clangd` and `ccls`.

## [0.2.2] - February 02, 2021
### Added
- Added configurations to customize where definitions of getters and setters are placed. (#1)
- Added `Auto` configuration for `Curly Brace Format: Namespace`.
- Added configuration to control whether `Add Definition` reveals new definitions in the editor.

### Fixed
- Improved performance of `Add Definition` commands/code-actions.
- Improved `Add Definition` sometimes not scrolling to the new definition in large files. (This still happens, but less often. It is unclear why.)
- Fixed `cmantic.addHeaderGuard` placement of `#endif` in the case that the file does not end in a newline.
- Improved parameter parsing of `Add Definition`.
- Fixed `Add Definition` text alignment in the case that text appearing before the parameter list is multi-line.
- Fixed `Add Definition` parsing of function templates.

## [0.2.1] - January 29, 2021
### Changed
- `cmantic.addHeaderGuard` will now validate static text given by the user in the `C_mantic.headerGuard.defineFormat` setting by replacing illegal symbols with underscores.
- `cmantic.createMatchingSourceFile` will now sort directory suggestions based on their similarity to the header file's directory. This means that the top directory in the list is most likely the directoy the user wants to put the new file in, and can just press enter.
- `cmantic.createMatchingSourceFile` will now look at the file extensions in the selected directory and automatically pick one when there is only one type of source file extension found.
- Invoking the `cmantic.addHeaderGuard` command directly now checks for an existing header guard.
- Directly invoking commands to generate accessor functions now checks for existing accessor functions.

### Fixed
- Improved performance of `cmantic.switchHeaderSourceInWorkspace` by caching header/source pairs after they are found.
- Improved performance of `Add Definition` commands/code-actions.
- Fixed where `cmantic.addInclude` places new includes in the case that the file has no existing include statements and is non-empty.
- Fixed `Add Definition` adding extra end-parenthesis for `ccls` and `clangd`.
- Fixed `cmantic.addDefinitionInCurrentFile` placement for `ccls`. Certain macros within classes confuses `ccls`'s DocumentSymbols, such as Qt's Q_OBJECT macro.
- Fixed `cmantic.addInclude` positioning for `ccls` and `clangd`.
- Fixed `Add Definition` of `operator` overload functions for `ccls` and `clangd`.
- Fixed `Add Definition` not recognizing static member functions for `ccls`.

## [0.2.0] - January 22, 2021
### Added
- `cmantic.generateGetterSetter`, `cmantic.generateGetter`, and `cmantic.generateSetter` commands/code-actions.
- `cmantic.createMatchingSourceFile` can now generate namespace blocks. Configurations were added to customize this behavior.

### Changed
- `Curly Brace Format` for functions was split into separate configurations for C and C++.

### Fixed
- `cmantic.addHeaderGuard` will now replace any illegal symbols found in the file name with an underscore when creating a `#define` name.
- Removed `cmantic.addDefinition` from appearing in the command palette as this is an internal command and would throw an error if invoked this way.
- Removed duplicate entries of `Refactor...` and `Source Action...` from appearing in the command palette.
- Fixed issues pertaining to how the placement of new function definitions is determined.
- Fixed `Add Definition` not recognizing `operator` overload functions.
- Fixed `Add Definition` not placing function into a cooresponding namespace block when that block was empty.
- Various minor fixes.

## [0.1.0] - January 15, 2021
### Added
- `cmantic.switchHeaderSourceInWorkspace` command
- `cmantic.addDefinitionInSourceFile` command/code-action
- `cmantic.addDefinitionInCurrentFile` command/code-action
- `cmantic.createMatchingSourceFile` command/code-action
- `cmantic.addInclude` command/code-action
- `cmantic.addHeaderGuard` command/code-action
