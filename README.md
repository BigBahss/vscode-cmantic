<h1 align="center">
  <img src="./docs/assets/images/cmantic-small.png" width="128">
  <br>
  <b>C-mantic</b>
</h1>

C/C++ extension that provides code generation and refactorings. Relevant code-actions are suggested via the light-bulb menu 💡, and can be accessed directly by selecting `Refactor...` or `Source Actions...` in the editor context menu. All code-actions are also available from the command palette or by keyboard shortcut.

## **Features at a glance**

- [Add Definition](#add-definition)
- [Add Declaration](#add-declaration)
- [Move Definition](#move-definition)
- [Generate Getters and Setters](#generate-getters-and-setters)
- [Generate Equality Operators](#generate-equality-operators)
- [Generate Relational Operators](#generate-relational-operators)
- [Generate Stream Output Operator](#generate-stream-output-operator)
- [Create Matching Source File](#create-matching-source-file)
- [Add Header Guard](#add-header-guard)
- [Add Include](#add-include)
- [Switch Header/Source in Workspace](#switch-headersource-in-workspace)

## **Requirements**

Requires a C/C++ language server extension for full functionality, such as Microsoft's `C/C++` extension. See [Language Server](#language-server) For more details.

## **Issues and Feature Requests**

If you find a bug or would like to request a new feature, please open an [Issue](https://github.com/BigBahss/vscode-cmantic/issues) on Github. Also, consider leaving the extension a [rating](https://marketplace.visualstudio.com/items?itemName=tdennis4496.cmantic#review-details).

## **Features in-depth**

### **Add Definition**

![Add Definition](./docs/assets/images/add_definition.gif)

Selecting an undefined function declaration will suggest the following code-actions 💡.

The `Add Definition in matching source file` command generates an empty definition in a matching source file for a function declared in a header file.

The `Add Definition in this file` command generates an empty definition for a function declaration in the current file.

`Add Definition` will look for definitions of neighboring declarations in the target file and try to place new definitions in the same relative order. If a neighboring definition cannot be found then the new definition will be placed at the end of the file. Additionally, `Add Definition` will respect the formatting of your code and will intelligently adapt the whitespace alignment in the case of multi-lined declarations. The placement of the opening curly brace can be controlled with the setting `Curly Brace Format: Function` for C and C++, each. By default, the new definition will be revealed in the editor when added. This can be disabled with `Reveal New Definition` in the settings.

You may also generate many definitions at a time by selecting `Add Definitions...` in the `Refactor...` menu. This command will find all undefined functions in the file and prompt you to select which ones to add definitions for. After selecting functions you will be prompted to select which file to add the definitions to (either the same file, or the matching source file). If a matching source file doesn't already exist, you can select to create one (this invokes [Create Matching Source File](#create-matching-source-file)).

#### **Generate Constructor**

`Generate Constructor` extends `Add Definition` by prompting you to select what you want to initialize in the constructor (delegating constructor, base class constructor(s), member variables) and will generate the boiler-plate for the initializer list.

### **Add Declaration**

Selecting the name of an undeclared function definition will suggest the following code-action 💡.

The `Add Declaration` command generates a declaration for a function in its corresponding header file, or within its class definition in the case of a member function.

If the function is a member function, then the `Add Declaration` code-action will be provided as a `Quick Fix` (blue light-bulb). You will also be prompted to pick an access specifier (`public`, `protected`, or `private`) for the member function, and if that access specifier doesn't already exist in the class, it will be added.

### **Move Definition**

Selecting the name of a function definition will suggest the following code-actions 💡.

The `Move Definition to matching source file` command will move a function definition to a matching header/source file.

The `Move Definition into/out-of class body` command will move a member function definition into/below a class body.

`Move Definition` tries to find a good location for the function in the same way that `Add Definition` does. Also, when moving a definition from a header file that does not contain a declaration for that function, or when moving from a class body, a declaration will be left behind in its place. Moving definitions will also move leading comments. If you don't want leading comments to be moved when a declaration is being left behind, disable `Always Move Comments` in the settings.

### **Generate Getters and Setters**

![Generate Accessors](./docs/assets/images/generate_accessors.gif)

Selecting the name of a member variable will suggest the following code-actions 💡.

The `Generate Getter and Setter`, `Generate Getter`, and `Generate Setter` commands will generate accessor functions for a member variable. C-mantic will look for common private member naming schemes in order to generate appropriate function names: If a member variable name begins and/or ends with underscore(s), or if it begins with `m_` or `s_`, these characters will be removed to create the member function names. The `Case Style` setting controls whether names are generated in snake_case, camelCase, or PascalCase.

Additionally, for non-primitive, non-pointer data types, setters will be generated with a const-reference (`const &`) parameter type. If you would like C-mantic to resolve `typedef`'s, `type-alias`'s, and `enum`'s, enable `Cpp: Resolve Types` in the settings (This is disabled by default as it may impact the performance of generating setters).

The `Accessor: Getter Definition Location` and `Accessor: Setter Definition Location` settings control where the definitions of these member functions are placed (either inline, below class body, or in matching source file).

### **Generate Equality Operators**

With your cursor inside of a class/struct, `Generate Equality Operators` can be found in the `Refactor...` menu.

The `Generate Equality Operators` command will prompt you to select base classes and member variables to compare in order to generate `operator==` (`operator!=` will be generated as the negation of `operator==`). You will also be prompted for where to place the definitions of these functions (either 'Inline', 'Current File', or 'Source File'). By default, equality operators will be generated as member functions, but can also be generated as friend functions by enabling `Cpp: Friend Comparison Operators` in the settings.

### **Generate Relational Operators**

With your cursor inside of a class/struct, `Generate Relational Operators` can be found in the `Refactor...` menu.

The `Generate Relational Operators` command will prompt you to select base classes and member variables to compare in order to generate `operator<` (`operator>`, `operator<=`, and `operator>=` are generated in terms of `operator<`). You will also be prompted for where to place the definitions of these functions (either 'Inline', 'Current File', or 'Source File'). By default, relational operators will be generated as member functions, but can also be generated as friend functions by enabling `Cpp: Friend Comparison Operators` in the settings.

### **Generate Stream Output Operator**

With your cursor inside of a class/struct, `Generate Stream Output Operator` can be found in the `Refactor...` menu.

The `Generate Stream Output Operator` command generates a friend `operator<<` that outputs to a `std::ostream`. You will be prompted to select base classes and member variables to output. You will also be prompted for where to place the definition of this function (either 'Inline', 'Current File', or 'Source File').

Additionally, if the file does not already include `ostream` or `iostream` directly, then `#include <ostream>` will be added to the file.

### **Create Matching Source File**

`Create Matching Source File` can be found in the `Source Actions...` menu.

The `Create Matching Source File` command creates a new source file from a header by prompting you for a target directory and file extension. Target directories containing source files will be recommended based on their similarity the header file's directory. Additionally, C-mantic will automatically pick a file extension if all source files in the target directory have the same extension. An include statement for the header file will be inserted into the new source file.

When creating a C++ source file from a header containing namespaces, these namespace blocks will be generated too. Check out the settings for various ways to customize this behavior, or to disable namespace generation.

After the file is created, you will also be asked if you want to add definitions for functions declared in the header file.

### **Add Header Guard**

`Add Header Guard`/`Amend Header Guard` can be found in the `Source Actions...` menu.

The `Add Header Guard` command adds a header guard to the current header file. Based on the `Header Guard: Style` setting, C-mantic will insert either a conditional `#define` block, `#pragma once`, or both. `#define` names are generated based on the setting `Header Guard: Define Format`.

If the file already has a header guard that does not match your configured style, then the `Add Header Guard` command will "amend" the existing one to match your configuration. Additionally, if you select the header guard with your cursor, then `Amend Header Guard` will be suggested as a `Quick Fix`.

### **Add Include**

`Add Include` can be found in the `Source Actions...` menu.

The `Add Include` command adds a new include statement to the top of the file from your current position. C-mantic will parse existing include statements to find the best position to add the new include. For example, if you're adding a system include (`#include <...>`), it will be appended it to the largest block of system include statements in the file. Same for project includes (`#include "..."`).

### **Switch Header/Source in Workspace**

The `Switch Header/Source in Workspace` command will open and switch to the header/source file that corresponds to the active file. C-mantic will only look for matching header/source files within the current workspace, which may offer better accuracy over other implementations. You can control whether or not this appears in the editor context menu with the setting `Context Menu: Switch Header Source`.

## **Language Server**

If you find that features of C-mantic aren't working, ensure that your language server is working correctly. To do this, check out the Outline View, usually found in the Explorer side-bar. The Outline View should show all symbols for the current file. Also, make sure 'Go to Definition' and 'Go to Declaration' are working.

C-mantic is primarily tested with `C/C++` (ms-vscode.cpptools) and `clangd` (llvm-vs-code-extensions.vscode-clangd), but will also work on `ccls` (ccls-project.ccls). If you use a different language server, C-mantic may still work, but is untested. If you find a bug that you suspect might related to your language server, please open an [Issue](https://github.com/BigBahss/vscode-cmantic/issues) and state what language server you are using.

## **Tips**

- C-mantic relies on the language server to provide information about your source code in order to function correctly. Because of this, if the language server running slowly, C-mantic may fail to provide code-actions right away. For instance, if you type out a function declaration, C-mantic won't be able to provide the `Add Definition` code-actions until the language server updates. To mitigate this, you can change how often the language server updates in response to code changes:
  - For `C/C++` (ms-vscode.cpptools), you can lower the `C_Cpp: Intelli Sense Update Delay` setting (default 2000ms).
  - For `ccls` (ccls-project.ccls), you can lower the `Status Update Interval` setting (default 2000ms).

## **Planned Features**

The list of planned features/ideas can be found [here](https://github.com/BigBahss/vscode-cmantic/blob/master/TODO.md). Feel free recommend ideas for new features/functionalities via opening an [Issue](https://github.com/BigBahss/vscode-cmantic/issues) on Github. And of course, if you'd like to contribute, feel free to open a pull-request.

## **License**

This software is released under the [MIT License](https://opensource.org/licenses/MIT)
