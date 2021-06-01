---
layout: default
title: Issues/Feedback/Plans
permalink: /issues-feedback/
nav_order: 3
---

## Issues and Feedback

If you find a bug in C-mantic or feel like something isn't working right, please open an [Issue](https://github.com/BigBahss/vscode-cmantic/issues) on Github. Feature requests are also welcome. New contributors are encouraged to get involved; Pull Requests are welcome. Also, if you find C-mantic useful, consider leaving the extension a [rating](https://marketplace.visualstudio.com/items?itemName=tdennis4496.cmantic#review-details).

## Planned features and improvements

Coming in `v0.9.0`: [Update Function Signature]({{ site.url }}/vscode-cmantic/features/update-function-signature/) which synchronizes changes between a function's declaration and definition. Completion suggestions are added to [Add Include]({{ site.url }}/vscode-cmantic/features/add-include/).

### Higher priority

- Generate implementations for pure virtual functions of base classes.

- Generate overrides for virtual functions of base classes.

### Lower priority

- Open header/source file in a new editor column.

- Check for the existence of `.vscode/c_cpp_properties.json` or `compile_commands.json` to parse include paths and improve the generation of the include statement in `cmantic.createMatchingSourceFile`, amongst other things.
