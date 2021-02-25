# TODO

Things higher on the list generally correspond to higher priority, although the first few are in no particular order.

## Ideas/Plans for features and improvements

- Generate all definitions from a header file. Additionally, add a setting to do this automatically when when invoking `cmantic.createMatchingSourceFile`.

- Generate relational operators.

- Generate stream output operator.

- Add a code action (`CodeActionKind.RefactorRewrite`) to edit a function's signature and synchronize the change between declaration and definition. I imagine this would work similar to `Rename Symbol`. We might be able to synchronize the change across references for trivial changes, such as re-ordering parameters.

- Check for the existence of `.vscode/c_cpp_properties.json` or `compile_commands.json` to parse include paths and improve the generation of the include statement in `cmantic.createMatchingSourceFile`, amongst other things.

- Investigate a way to provide completion suggestions to `cmantic.addInclude`.

- Open header/source file in a new editor column.
