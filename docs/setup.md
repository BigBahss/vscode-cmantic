---
layout: default
title: Setup
permalink: /setup/
nav_order: 1
---

# Setup

C-mantic is very easy to set up and is designed to work out-of-the-box. After installation, check out the extension's settings for various ways to customize C-mantic.

## Install

C-mantic can be installed directly from VS Code by searching for it in the `Extensions` side-bar, or by launching `Quick Open` (Ctrl+P) and entering the command `ext install tdennis4496.cmantic`. You can also download it directly from VS Code's Marketplace [here](https://marketplace.visualstudio.com/items?itemName=tdennis4496.cmantic).

## Requirements

Requires a C/C++ language server extension (IntelliSense) for full functionality, such as Microsoft's [C/C++ extension](https://code.visualstudio.com/docs/languages/cpp).

## Language Server

C-mantic is designed to work with any C/C++ language server, and is primarily tested with [C/C++](https://marketplace.visualstudio.com/items?itemName=ms-vscode.cpptools) (`ms-vscode.cpptools`) and [clangd](https://marketplace.visualstudio.com/items?itemName=llvm-vs-code-extensions.vscode-clangd) (`llvm-vs-code-extensions.vscode-clangd`), but will also work on [ccls](https://marketplace.visualstudio.com/items?itemName=ccls-project.ccls) (`ccls-project.ccls`). If you use a different language server, C-mantic may still work, but is untested. If you find a bug that you suspect might be related to your language server, please open an [Issue](https://github.com/BigBahss/vscode-cmantic/issues) and state what language server you are using.

## Troubleshooting

If you find that features of C-mantic aren't working, first make sure that your language server (IntelliSense) is working correctly. To do this, check out the Outline View, usually found in the `Explorer` side-bar. The Outline View should show all source code symbols for the current file. Also, make sure `Go to Definition` and `Go to Declaration` are working. If C-mantic still isn't working correctly, open an [Issue](https://github.com/BigBahss/vscode-cmantic/issues) on GitHub and describe the problem along with any relevant information.

## Tips

- C-mantic relies on the language server to provide information about your source code in order to function correctly. Because of this, if the language server running slowly, C-mantic may fail to provide code-actions right away. For instance, if you type out a function declaration, C-mantic won't be able to provide the `Add Definition` code-actions until the language server updates. To mitigate this, you can change how often the language server updates in response to code changes:
  - For `C/C++` (ms-vscode.cpptools), you can lower the `C_Cpp: Intelli Sense Update Delay` setting (default 2000ms).
  - For `ccls` (ccls-project.ccls), you can lower the `Status Update Interval` setting (default 2000ms).
