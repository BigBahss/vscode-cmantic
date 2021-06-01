# TODO

## Ideas/Plans for features and improvements

Coming in `v0.9.0`: `Update Function Signature` which synchronizes changes between a function's declaration and definition. Completion suggestions are added to `Add Include`.

### Higher priority

- Generate implementations for pure virtual functions of base classes.

- Generate overrides for virtual functions of base classes.

### Lower priority

- Open header/source file in a new editor column.

- Check for the existence of `.vscode/c_cpp_properties.json` or `compile_commands.json` to parse include paths and improve the generation of the include statement in `cmantic.createMatchingSourceFile`, amongst other things.
