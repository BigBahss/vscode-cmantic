# TODO

Things higher on the list generally correspond to higher priority.

## Ideas/Plans for features and improvements

- Generate all definitions from a header file. Additionally, add a setting to do this automatically when when invoking `cmantic.createMatchingSourceFile`.

- Add a code action (`CodeActionKind.RefactorRewrite`) to edit a function's signature and syncrhonize the change between declaration and definition. I imagine this would work similar to `Rename Symbol`. We might be able to syncrhonize the change across references for trivial changes, such as re-ordering parameters.

- Check for the existence of `.vscode/c_cpp_properties.json` or `compile_commands.json` to parse include paths and improve the generation of the include statement in `cmantic.createMatchingSourceFile`, amongst other things.

- Investigate a way to provide completion suggestions to `cmantic.addInclude`.

- Open header/source file in a new editor column.

- Add a "true" switch header/source command that closes the current file and opens the matching header/source in its place, as to not clutter the tab bar. This may not be practical if the language server needs update on every switch as if it is a completely new file being opened. Ideally we could keep the matching file and its symbols in memory.
