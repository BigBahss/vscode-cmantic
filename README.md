# C-mantic

A C/C++ extension for VS Code that adds semantic aware commands and refactorings.

## Features

### Switch Header/Source
`cmantic.switchHeaderSource` is an alternative to Microsoft's implementation in the `C/C++` extension, and acounts for the location of files. Microsoft's implementation seems to look for files in the system's include directories before looking within the workspace.

### Add Definition
The `cmantic.addDefinitionInSourceFile` command/code-action creates an empty definition in a matching source file from a function declaration in a header file.

The `cmantic.addDefinitionInCurrentFile` command/code-action creates an empty definition in the current file from a function declaration.

### Create Matching Source File
The `cmantic.createMatchingSourceFile` command/code-action creates a new source file from a header file by prompting you for a target directory and file extension.

### Add Include
The `cmantic.addInclude` command/code-action adds includes to the top of the file from your current position. The command parses existing include statements to find the best position to add the new include. For example, if you're adding a system include (`#include <...>`), it will append it to largest block of sequential system include statements in the file. Same for project includes (`#include "..."`).
