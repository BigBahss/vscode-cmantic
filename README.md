<h1 align="center">
  <img src="./docs/assets/images/cmantic-small.png" width="128">
  <br>
  <b>C-mantic</b>
</h1>

C-mantic provides code generation and refactorings for C/C++. Relevant code-actions are suggested via the light-bulb menu 💡, and can be accessed directly by selecting `Refactor...` or `Source Actions...` in the editor context menu. Code-actions are also available from the command palette or by keyboard shortcut.

Full Documentation: [https://bigbahss.github.io/vscode-cmantic/](https://bigbahss.github.io/vscode-cmantic/)

## **Features at a glance**

- [Add Definition](https://bigbahss.github.io/vscode-cmantic/features/add-definition/)
- [Add Declaration](https://bigbahss.github.io/vscode-cmantic/features/add-declaration/)
- [Update Function Signature](https://bigbahss.github.io/vscode-cmantic/features/update-function-signature/)
- [Move Definition](https://bigbahss.github.io/vscode-cmantic/features/move-definition/)
- [Generate Getters and Setters](https://bigbahss.github.io/vscode-cmantic/features/generate-getters-and-setters/)
- [Generate Equality Operators](https://bigbahss.github.io/vscode-cmantic/features/generate-equality-operators/)
- [Generate Relational Operators](https://bigbahss.github.io/vscode-cmantic/features/generate-relational-operators/)
- [Generate Stream Output Operator](https://bigbahss.github.io/vscode-cmantic/features/generate-stream-output-operator/)
- [Create Matching Source File](https://bigbahss.github.io/vscode-cmantic/features/create-matching-source-file/)
- [Add Header Guard](https://bigbahss.github.io/vscode-cmantic/features/add-header-guard/)
- [Add Include](https://bigbahss.github.io/vscode-cmantic/features/add-include/)
- [Switch Header/Source in Workspace](https://bigbahss.github.io/vscode-cmantic/features/switch-header-source/)

## **Requirements**

Requires a C/C++ language server extension for full functionality, such as Microsoft's `C/C++` extension. See [Language Server](#language-server) below for more details.

## **Issues and Feedback**

If you find a bug or would like to request a new feature, please open an [Issue](https://github.com/BigBahss/vscode-cmantic/issues) on Github. Also, consider leaving the extension a [rating](https://marketplace.visualstudio.com/items?itemName=tdennis4496.cmantic#review-details).

## **Examples**

### **Add Definition**

![Add Definition](https://bigbahss.github.io/vscode-cmantic/assets/images/add_definition.gif)

### **Update Function Signature**

![Update Function Signature](https://bigbahss.github.io/vscode-cmantic/assets/images/update_signature.gif)

### **Generate Getters and Setters**

![Generate Getters and Setters](https://bigbahss.github.io/vscode-cmantic/assets/images/generate_accessors.gif)

## **Language Server**

C-mantic is designed to work with any C/C++ language server, and is primarily tested with `C/C++` (ms-vscode.cpptools) and `clangd` (llvm-vs-code-extensions.vscode-clangd), but will also work on `ccls` (ccls-project.ccls). If you use a different language server, C-mantic may still work, but is untested. If you find a bug that you suspect might related to your language server, please open an [Issue](https://github.com/BigBahss/vscode-cmantic/issues) and state what language server you are using.

## **Troubleshooting**

If you find that features of C-mantic aren't working, first make sure that your language server (IntelliSense) is working correctly. To do this, check out the Outline View, usually found in the `Explorer` side-bar. The Outline View should show all source code symbols for the current file. Also, make sure `Go to Definition` and `Go to Declaration` are working. If C-mantic still isn't working correctly, open an [Issue](https://github.com/BigBahss/vscode-cmantic/issues) on GitHub and describe the problem along with any relevant information.

## **Tips**

- C-mantic relies on the language server to provide information about your source code in order to function correctly. Because of this, if the language server running slowly, C-mantic may fail to provide code-actions right away. For instance, if you type out a function declaration, C-mantic won't be able to provide the `Add Definition` code-actions until the language server updates. To mitigate this, you can change how often the language server updates in response to code changes:
  - For `C/C++` (ms-vscode.cpptools), you can lower the `C_Cpp: Intelli Sense Update Delay` setting (default 2000ms).
  - For `ccls` (ccls-project.ccls), you can lower the `Status Update Interval` setting (default 2000ms).

## **Planned Features**

The list of planned features can be found [here](https://bigbahss.github.io/vscode-cmantic/issues-feedback/#planned-features-and-improvements). Requests for new features/functionalities are welcome, just open an [Issue](https://github.com/BigBahss/vscode-cmantic/issues) on Github. If you'd like to contribute, feel free to open a pull-request.

## **License**

This software is released under the [MIT License](https://opensource.org/licenses/MIT)
