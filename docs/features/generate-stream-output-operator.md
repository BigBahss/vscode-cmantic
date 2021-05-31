---
layout: default
title: Generate Stream Output Operator
permalink: /features/generate-stream-output-operator/
nav_order: 6
parent: Features
---

### **Generate Stream Output Operator**

With your cursor inside of a class/struct, `Generate Stream Output Operator` can be found in the `Refactor...` menu.

The `Generate Stream Output Operator` command generates a friend `operator<<` that outputs to a `std::ostream`. You will be prompted to select base classes and member variables to output. You will also be prompted for where to place the definition of this function (either 'Inline', 'Current File', or 'Source File').

Additionally, if the file does not already include `ostream` or `iostream` directly, then `#include <ostream>` will be added to the file.
