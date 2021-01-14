# C-mantic

C/C++ extension for VS Code that adds semantic aware commands and refactorings.

## Features
C-mantic contributes various commands and code actions to VS Code. Relevant code actions will be suggested via the lightbulb menu, and can be accessed directly by selecting `Refactor...` or `Source Actions...` in the editor context menu.

### Add Definition
The `cmantic.addDefinitionInSourceFile` command/code-action creates an empty definition in a matching source file from a function declaration in a header file.

The `cmantic.addDefinitionInCurrentFile` command/code-action creates an empty definition in the current file from a function declaration.

`Add Definition` respects the formatting of your code and will intelligently adapt the allignment in the case of multi-line declarations.

### Create Matching Source File
The `cmantic.createMatchingSourceFile` command/code-action creates a new source file from a header file by prompting you for a target directory and file extension.

### Add Include
The `cmantic.addInclude` command/code-action adds includes to the top of the file from your current position. The command parses existing include statements to find the best position to add the new include. For example, if you're adding a system include (`#include <...>`), it will append it to largest block of sequential system include statements in the file. Same for project includes (`#include "..."`).

### Switch Header/Source
`cmantic.switchHeaderSource` is an alternative to Microsoft's implementation in the `C/C++` extension, and acounts for the location of files. Microsoft's implementation seems to look for files in the system's include directories before looking within the workspace.
