---
layout: default
title: Generate Equality Operators
permalink: /features/generate-equality-operators/
nav_order: 5
parent: Features
---

# Generate Equality Operators

With your cursor inside of a class/struct, `Generate Equality Operators` can be found in the `Refactor...` menu.

The `Generate Equality Operators` command will prompt you to select base classes and member variables to compare in order to generate `operator==` (`operator!=` will be generated as the negation of `operator==`). You will also be prompted for where to place the definitions of these functions (either 'Inline', 'Current File', or 'Source File'). By default, equality operators will be generated as member functions, but can also be generated as friend functions by enabling `Cpp: Friend Comparison Operators` in the settings.
