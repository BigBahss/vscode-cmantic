---
layout: default
title: Add Declaration
permalink: /features/add-declaration/
nav_order: 1
parent: Features
---

### **Add Declaration**

Selecting the name of an undeclared function definition will suggest the following code-action 💡.

The `Add Declaration` command generates a declaration for a function in its corresponding header file, or within its class definition in the case of a member function.

If the function is a member function, then the `Add Declaration` code-action will be provided as a `Quick Fix` (blue light-bulb). You will also be prompted to pick an access specifier (`public`, `protected`, or `private`) for the member function, and if that access specifier doesn't already exist in the class, it will be added.
