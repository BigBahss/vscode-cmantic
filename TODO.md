# TODO

## Ideas/Plans for features and improvements

### Higher priority

- Generate relational operators.

- Generate implementations for pure virtual functions of base classes.

- Generate overrides for virtual functions of base classes.

- Update function signature. After changing a function's signature, the light-bulb will popup to prompt the user to update the declaration/definition of the function.

### Lower priority

- Add a code-action to update a header guard if it doesn't match the configured settings.

- Check for the existence of `.vscode/c_cpp_properties.json` or `compile_commands.json` to parse include paths and improve the generation of the include statement in `cmantic.createMatchingSourceFile`, amongst other things.

- Investigate a way to provide completion suggestions to `cmantic.addInclude`.

- Open header/source file in a new editor column.
