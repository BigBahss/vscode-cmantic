---
layout: default
title: Add Include
permalink: /features/add-include/
nav_order: 10
parent: Features
---

## **Add Include**

`Add Include` can be found in the `Source Actions...` menu.

The `Add Include` command adds a new include statement to the top of the file from your current position. C-mantic will parse existing include statements to find the best position to add the new include. For example, if you're adding a system include (`#include <...>`), it will be appended it to the largest block of system include statements in the file. Same for project includes (`#include "..."`).
