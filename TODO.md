# TODO

`Generate Stream Output Operator` is coming for v0.7.0.

Things higher on the list generally correspond to higher priority, although the first few are in no particular order.

## Ideas/Plans for features and improvements

- Generate many definitions at a time. Additionally, add a setting to do this automatically when when invoking `cmantic.createMatchingSourceFile`.

- Generate relational operators.

- Update function signature. After changing a function's signature, the light-bulb will popup to prompt the user to update the declaration or definition of the function. Vscode offers a built-in `CodeActionKind.RefactorRewrite` which is perfect for this feature.

- Add a command/code-action to update a header guard if it doesn't match the configured settings.

- Check for the existence of `.vscode/c_cpp_properties.json` or `compile_commands.json` to parse include paths and improve the generation of the include statement in `cmantic.createMatchingSourceFile`, amongst other things.

- Investigate a way to provide completion suggestions to `cmantic.addInclude`.

- Open header/source file in a new editor column.
