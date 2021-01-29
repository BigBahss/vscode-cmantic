<h1 align="center">
    <img src="./images/cmantic.png" width="128">
    <br>
    C-mantic
</h1>

C-mantic is a C/C++ extension for VS Code that provides semantic aware commands and refactorings. Relevant code actions are suggested via the lightbulb menu, and can be accessed directly by selecting `Refactor...` or `Source Actions...` in the editor context menu. All code actions are also available from the command palette.

## Features at a glance

- [Add Definition](#add-definition)
- [Generate 'get' and 'set' Methods](#generate-get-and-set-methods)
- [Add Include](#add-include)
- [Add Header Guard](#add-header-guard)
- [Create Matching Source File](#create-matching-source-file)
- [Switch Header/Source in Workspace](#switch-headersource-in-workspace)

## Dependencies

C-mantic requires a C/C++ language server extension, such as Microsoft's `C/C++` extension (ms-vscode.cpptools). C-mantic is primarily tested with `C/C++` (ms-vscode.cpptools), but has also been tested to work on `ccls` (ccls-project.ccls) and `clangd` (llvm-vs-code-extensions.vscode-clangd).

## Features in-depth

---

### Add Definition
Selecting an undefined function declaration with your cursor will suggest the following code actions in the lightbulb menu.

The `cmantic.addDefinitionInSourceFile` command/code-action creates an empty definition in a matching source file from a function declaration in a header file.

The `cmantic.addDefinitionInCurrentFile` command/code-action creates an empty definition in the current file from a function declaration.

`Add Definition` will look for definitions of neighboring declarations in the target file and try to place the new definitions next to them. If a neighboring definition cannot be found then the new definition will be placed at the end of the file. Additionally, `Add Definition` will respect the formatting of your code and will intelligently adapt the whitespace allignment in the case of multi-line declarations. The placement of the opening curly brace can be controlled with `Curly Brace Format: Function` in the settings for C and C++.

### Generate 'get' and 'set' Methods
Selecting a class member variable with your cursor will suggest the following code actions based on what accessor method(s) already exist for that member variable.

The `cmantic.generateGetterSetter`, `cmantic.generateGetter`, and `cmantic.generateSetter` commands/code-actions will generate accessor methods for a member variable within a class. C-mantic will look for common private member naming schemes in order to generate appropriate accessor names. If a member variable name begins and/or ends with underscore(s), or if it begins with `m_`, these will be removed to create the method names. For example, a member `int m_data` will generate accessors `int data() const` and `void setData(int value)`, whereas a member `int data` will generate accessors `int getData() const` and `void setData(int value)`. Additionally, for non-primitive, non-pointer data types, 'set' methods will be generated with a const-reference (`const &`) parameter type (Currently, C-mantic does not resolve `typedef`'s or `type alias`'s, and treats them as non-primitive).

### Add Include
`Add Include` can be found under `Source Actions...` in the editor context menu.

The `cmantic.addInclude` command/code-action adds includes to the top of the file from your current position. The command parses existing include statements to find the best position to add the new include. For example, if you're adding a system include (`#include <...>`), it will append it to largest block of sequential system include statements in the file. Same for project includes (`#include "..."`).

### Add Header Guard
`Add Header Guard` can be found under `Source Actions...` in the editor context menu.

The `cmantic.addHeaderGuard` command/code-action adds a header guard to the current header file based on `Header Guard: Style` in the settings. Based on this setting C-mantic will insert either a conditional `#define` block, `#pragma once`, or both. `#define` names are generated based on `Header Guard: Define Format` in the settings.

### Create Matching Source File
`Create Matching Source File` can be found under `Source Actions...` in the editor context menu.

The `cmantic.createMatchingSourceFile` command/code-action creates a new source file from a header by prompting you for a target directory and file extension. Target directories containing source files will be recommended based on their similarity the header file's directory. Additionally, C-mantic will automatically pick a file extension if all source files in the target directory have the same extension. An include statement for the header file will be inserted into the new source file.

When creating a C++ source file from a header containing namespaces, these namespace blocks will be generated too. Check out the settings for various ways to customize this behavior, or to turn off namespace generation entirely.

### Switch Header/Source in Workspace
The `cmantic.switchHeaderSourceInWorkspace` command will open and switch to the matching header/source file cooresponding to the active file. C-mantic will only look for matching header/source files within the current workspace, which may offer better accuracy over other implementations. You can control whether or not this appears in the editor context menu with `Context Menu: Switch Header Source` in the settings.
