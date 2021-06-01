---
layout: default
title: Generate Relational Operators
permalink: /features/generate-relational-operators/
nav_order: 6
parent: Features
---

## **Generate Relational Operators**

With your cursor inside of a class/struct, `Generate Relational Operators` can be found in the `Refactor...` menu.

The `Generate Relational Operators` command will prompt you to select base classes and member variables to compare in order to generate `operator<` (`operator>`, `operator<=`, and `operator>=` are generated in terms of `operator<`). You will also be prompted for where to place the definitions of these functions (either 'Inline', 'Current File', or 'Source File'). By default, relational operators will be generated as member functions, but can also be generated as friend functions by enabling `Cpp: Friend Comparison Operators` in the settings.
