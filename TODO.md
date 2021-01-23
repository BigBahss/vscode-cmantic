# TODO

Things higher on the list generally correspond to higher priority.

## Ideas for features and improvements

- Track the user's active TextDocument in order to improve the responsiveness of various commands (starting small with `cmantic.switchHeaderSourceInWorkspace`).

- Move a definition in or out of a class body.

- Move a definition between header and source file.

- Resolve `typedef`'s and `type alias`'s when generating a 'set' method to determine if the parameter should be pass-by-value or pass-by-const-ref.

- Check for the existence of `.vscode/c_cpp_properties.json` or `compile_commands.json` to parse include paths and improve the generation of the include statement in `cmantic.createMatchingSourceFile`, amongst other things.

- Generate all definitions from a header file.

- Open header/source file in a new editor column.

- Add a "true" switch header/source command by closing the current file and opening the matching header/source in its place, as to not clutter the tab bar. This may not be practical if the language server needs update on every switch as if it is a completely new file being opened. Ideally we could keep the matching file and its symbols in memory.

- Investigate a way to provide completion suggestions to `cmantic.addInclude`.
