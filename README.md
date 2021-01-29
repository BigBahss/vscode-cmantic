# C-mantic

C/C++ extension for VS Code that provides semantic aware commands and refactorings.

## Dependencies

C-mantic requires a C/C++ language server extension, such as Microsoft's `C/C++` extension (ms-vscode.cpptools). C-mantic is primarily tested with `C/C++` (ms-vscode.cpptools), but has also been tested to work on `ccls` (ccls-project.ccls) and `clangd` (llvm-vs-code-extensions.vscode-clangd).

## Features
C-mantic contributes various commands and code actions to VS Code. Relevant code actions will be suggested via the lightbulb menu, and can be accessed directly by selecting `Refactor...` or `Source Actions...` in the editor context menu.

### Add Definition
The `cmantic.addDefinitionInSourceFile` command/code-action creates an empty definition in a matching source file from a function declaration in a header file.

The `cmantic.addDefinitionInCurrentFile` command/code-action creates an empty definition in the current file from a function declaration.

`Add Definition` respects the formatting of your code and will intelligently adapt the whitespace allignment in the case of multi-line declarations. See `Curly Brace Format` in settings to control where the opening curly brace is inserted.

### Generate 'get' and 'set' Methods
The `cmantic.generateGetterSetter`, `cmantic.generateGetter`, and `cmantic.generateSetter` commands/code-actions will generate accessor methods for a member variable within a class. C-mantic will look for common private member naming schemes in order to generate appropriate accessor names. If a member variable name begins and/or ends with underscore(s), or if it begins with `m_`, they will be removed to create the method names. For example, a member `int m_data` will generate accessors `int data() const` and `void setData(int value)`, whereas a member `int data` will generate accessors `int getData() const` and `void setData(int value)`. Additionally, for non-primitive, non-pointer data types, 'set' methods will be generated with a const-reference (`const &`) parameter type. Currently, C-mantic does not resolve `typedef`'s or `type alias`'s, and treats them as non-primitive.

### Create Matching Source File
The `cmantic.createMatchingSourceFile` command/code-action creates a new source file from a header file by prompting you for a target directory and file extension. When creating a C++ source file from a header containing namespaces, these namespace blocks will be generated too. Check out C-mantic's settings for various ways to customize this behavior, or to turn off namespace generation.

### Add Include
The `cmantic.addInclude` command/code-action adds includes to the top of the file from your current position. The command parses existing include statements to find the best position to add the new include. For example, if you're adding a system include (`#include <...>`), it will append it to largest block of sequential system include statements in the file. Same for project includes (`#include "..."`).

### Add Header Guard
The `cmantic.addHeaderGuard` command/code-action adds a header guard to the current header file based on your `Header Guard: Style` setting. Based on this setting C-mantic will insert either a conditional `#define` block, `#pragma once`, or both. The `Header Guard: Define Format` setting controls how `#define` names are generated.

### Switch Header/Source in Workspace
The `cmantic.switchHeaderSourceInWorkspace` command will open and switch to the matching header/source file of the active file. C-mantic will only look for matching header/source files within the current workspace, which may offer better accuracy over other implementations. You can control whether or not this appears in the editor context menu with the `Context Menu: Switch Header Source` setting.
