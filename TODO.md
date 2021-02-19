# TODO

Things higher on the list generally correspond to higher priority.

## Ideas/Plans for features and improvements

- Generate all definitions from a header file. Additionally, add a setting to do this automatically when when invoking `cmantic.createMatchingSourceFile`.

- Enhance `Add Definition` to properly generate constructors with a member initializer list. This would probably require additional input from the user to specify what data members add to the list. Unclear what the best way to do that would be.

- Add a code action (`CodeActionKind.RefactorRewrite`) to edit a function's signature and synchronize the change between declaration and definition. I imagine this would work similar to `Rename Symbol`. We might be able to synchronize the change across references for trivial changes, such as re-ordering parameters.

- Check for the existence of `.vscode/c_cpp_properties.json` or `compile_commands.json` to parse include paths and improve the generation of the include statement in `cmantic.createMatchingSourceFile`, amongst other things.

- Investigate a way to provide completion suggestions to `cmantic.addInclude`.

- Open header/source file in a new editor column.
