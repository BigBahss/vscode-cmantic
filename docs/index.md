---
layout: home
title: Home
nav_order: 0
---

<h1 align="center">
  <img src="./assets/images/cmantic-small.png" width="128">
  <br>
  <b>C-mantic</b>
</h1>

C-mantic is an [extension](https://marketplace.visualstudio.com/items?itemName=tdennis4496.cmantic) for [VS Code](https://code.visualstudio.com/) that provides code generation and refactorings C/C++. Relevant code-actions are suggested via the light-bulb menu 💡, and can be accessed directly by selecting `Refactor...` or `Source Actions...` in the editor context menu. All code-actions are also available from the command palette or by keyboard shortcut.

## **Features at a glance**

- [Add Definition]({{ site.url }}/vscode-cmantic/features/add-definition/)
- [Add Declaration]({{ site.url }}/vscode-cmantic/features/add-declaration/)
- [Update Function Signature]({{ site.url }}/vscode-cmantic/features/update-function-signature/)
- [Move Definition]({{ site.url }}/vscode-cmantic/features/move-definition/)
- [Generate Getters and Setters]({{ site.url }}/vscode-cmantic/features/generate-getters-and-setters/)
- [Generate Equality Operators]({{ site.url }}/vscode-cmantic/features/generate-equality-operators/)
- [Generate Relational Operators]({{ site.url }}/vscode-cmantic/features/generate-relational-operators/)
- [Generate Stream Output Operator]({{ site.url }}/vscode-cmantic/features/generate-stream-output-operator/)
- [Create Matching Source File]({{ site.url }}/vscode-cmantic/features/create-matching-source-file/)
- [Add Header Guard]({{ site.url }}/vscode-cmantic/features/add-header-guard/)
- [Add Include]({{ site.url }}/vscode-cmantic/features/add-include/)
- [Switch Header/Source in Workspace]({{ site.url }}/vscode-cmantic/features/switch-header-source/)

## **Requirements**

Requires a C/C++ language server extension for full functionality, such as Microsoft's `C/C++` extension. See [Language Server](#language-server) For more details.

## **Issues and Feature Requests**

If you find a bug or would like to request a new feature, please open an [Issue](https://github.com/BigBahss/vscode-cmantic/issues) on Github. Also, consider leaving the extension a [rating](https://marketplace.visualstudio.com/items?itemName=tdennis4496.cmantic#review-details).

## **Language Server**

If you find that features of C-mantic aren't working, ensure that your language server is working correctly. To do this, check out the Outline View, usually found in the Explorer side-bar. The Outline View should show all symbols for the current file. Also, make sure 'Go to Definition' and 'Go to Declaration' are working.

C-mantic is primarily tested with `C/C++` (ms-vscode.cpptools) and `clangd` (llvm-vs-code-extensions.vscode-clangd), but will also work on `ccls` (ccls-project.ccls). If you use a different language server, C-mantic may still work, but is untested. If you find a bug that you suspect might related to your language server, please open an [Issue](https://github.com/BigBahss/vscode-cmantic/issues) and state what language server you are using.

## **Tips**

- C-mantic relies on the language server to provide information about your source code in order to function correctly. Because of this, if the language server running slowly, C-mantic may fail to provide code-actions right away. For instance, if you type out a function declaration, C-mantic won't be able to provide the `Add Definition` code-actions until the language server updates. To mitigate this, you can change how often the language server updates in response to code changes:
  - For `C/C++` (ms-vscode.cpptools), you can lower the `C_Cpp: Intelli Sense Update Delay` setting (default 2000ms).
  - For `ccls` (ccls-project.ccls), you can lower the `Status Update Interval` setting (default 2000ms).

## **Planned Features**

The list of planned features/ideas can be found [here]({{ site.url }}/vscode-cmantic/issues-feedback/#planned-features-and-improvements). Feel free recommend ideas for new features/functionalities via opening an [Issue](https://github.com/BigBahss/vscode-cmantic/issues) on Github. If you'd like to contribute, feel free to open a pull-request.

## **License**

This software is released under the [MIT License](https://opensource.org/licenses/MIT)
