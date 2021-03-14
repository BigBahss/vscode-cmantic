# Changelog
All notable changes to the `C-mantic` extension will be documented in this file.

## [0.6.2] - March 14, 2021
### Changed
- Generating getters, setters, and equality operators will now insert a `public:` access specifier if one is not found in the class.

### Fixed
- Fixed recognition of function definitions and declarations. Before, if a function definition ended with a semi-colon, it was recognized as a declaration.
- Improved recognition of virtual functions, and functions that are deleted or defaulted.
- Fixed `Move Definition into/out-of class body` code-action being suggested for free functions.
- Fixed `Generate Constructor` recognizing the `virtual` keyword as a base class.
- Fixed namespace generation for qualified namespace names and `inline` namespaces.
- Improved `Auto` namespace indentation.
- Fixed a bug when finding matching header/source files and when sorting directories displayed by `Create Matching Source File`.
- Fixed a bug where using `Move Definition into class` and selecting public access would do nothing.
- Fixed an error thrown on `clangd` when anonymous structs exist in the file.

## [0.6.1] - March 11, 2021
### Added
- Added support for explicit template specialization. Definitions for specialized function templates/member functions of specialized class templates can now be generated in the matching source file.
- Added support for nested templates.

### Changed
- Placement of generated code will now account for trailing comments.
- Template parameter(s) will now be added to the parameter of equality operators.

### Fixed
- Fixed title of `Add Declaration` code-action displaying the wrong target file.
- Fixed recognition of explicit template specializations, and multi-lined template statements.
- Fixed placement of `inline` specifier for function templates (`inline` was getting inserted before the template statement, which was a syntax error).
- Fixed an issue where, under certain conditions, generated definitions/declarations would be placed within unrelated blocks of code (this only happened on `ms-vscode.cpptools` and was a result of how it provides definitions/declarations for overloaded functions and undefined functions).
- Fixed name qualification of generated code in the case that a parent scope has a qualified name.
- Fixed a bug that would throw an error when generating equality operators for an empty class/struct.
- Fixed `Add Declaration` and `Move Definition` not recognizing parent class templates.
- Fixed recognition of leading comments. Comments that had multiple newlines in-between it and a symbol were incorrectly being recognized as leading comments.
- Fixed a bug where generated code would be placed at the very top of the file.

## [0.6.0] - March 09, 2021
### Added
- Added `cmantic.addDeclaration` command/code-action. `Add Declaration` will add a declaration of a function to the corresponding header file if the function is not already declared there. If the function is a member function, the declaration will be added to the class, wherever it is defined. Additionally for member functions, `Add Declaration` will be provided as a `Quick Fix` (suggested in the blue light-bulb menu), because defining a member function outside of the class with no declaration is an error. (#21)
- Added a setting `Code Actions: Enable Add Declaration` to control whether the `Add Declaration` code-action is suggested (light-bulb menu). (#21)
- Added more variables for generating header guard `#define`'s. See `Header Guard: Define Format` in the settings for the full list of available variables.

### Changed
- `Move Definition into class` will now be available for member functions that are not declared in the class. Similar to `Add Declaration`, this code-action will be provided as a `Quick Fix`, since it also fixes the underlying error. (#21)
- Changed the way that code generation determines line-spacing: If code is being inserted between 2 non-empty lines, it will no longer place an empty line in-between.

### Fixed
- Fixed whitespace alignment of `Add Definition` for member functions in the case that the declaration is not indented.
- Fixed indentation of code generated in classes in the case that the class is empty (before, if the class was empty, the new code would not be indented).

## [0.5.2] - February 28, 2021
### Added
- Template support has been expanded to properly generate member functions of class templates. Template parameter packs and default template arguments are now handled properly. (#18)

### Changed
- Function templates and member functions of class templates can no longer be generated outside of header files. If getter/setter definition locations are set to generate in source files, it will fallback to generating in the current file. (#18)
- Generating constructors will no longer prompt the user to select initializers if the class has no initializers, instead of showing an empty prompt.
- Generating equality operators will no longer prompt the user to select member variables to compare if the class has no member variables, instead of showing an empty prompt.

## [0.5.1] - February 27, 2021
### Added
- Added a setting `Cpp: Use Explicit This Pointer` to control whether generated member functions prefix class members with `this->`. (#17)

### Changed
- Handling of the `inline` specifier has changed. Definitions generated within header files will have the `inline` specifer to prevent ODR violations. Additionally, inline functions can now be moved to source files and the `inline` specifier will be removed. Definitions moved to header files will gain the `inline` specifier.
- Generating getters and setters for static members will now prefix the member with the class name (ClassName::staticMember).

### Fixed
- Fixed `Add Definition`'s whitespace alignment for multi-line declarations when removing leading specifiers (such as `virtual`, `static`, etc.). (#19)

## [0.5.0] - February 25, 2021
### Added
- `Add Definition` for constructors will now prompt the user for what they want to initialize (delegating constructor, base class constructor(s), member variables) and generate the boiler-plate for the initializer list.
- Added a setting `Cpp: Braced Initialization` to control whether member initializers use parentheses or curly braces.
- Added `cmantic.generateEqualityOperators` command/code-action.

### Changed
- Code-actions (refactorings) will now always appear in the `Refactor...` menu, even if they are disabled from being suggested in the light-bulb menu.

### Fixed
- Performance of finding header/source pairs has been improved for complex/remote workspaces. (#13)
- Fixed an issue where the header/source cache could be invalidated by file changes outside of VS Code. (#13)

## [0.4.2] - February 20, 2021
### Added
- Added a setting `Case Style` to control whether getters and setters are generated with names in snake_case, camelCase, or PascalCase. (#11)

### Changed
- `volatile` qualifier will now be stripped from getter return types as it has no effect.

### Fixed
- Fixed setter generation for reference types. (#12)
- Fixed a bug where primitive/pointer types would sometimes generate setters with a const-reference parameter.
- Fixed a bug where 'east' `const` and `mutable` qualifiers would not be stripped from getter return types.

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
