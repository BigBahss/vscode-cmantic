---
layout: default
title: Create Matching Source File
permalink: /features/create-matching-source-file/
nav_order: 8
parent: Features
---

# Create Matching Source File

`Create Matching Source File` can be found in the `Source Actions...` menu.

The `Create Matching Source File` command creates a new source file from a header by prompting you for a target directory and file extension. Target directories containing source files will be recommended based on their similarity the header file's directory. Additionally, C-mantic will automatically pick a file extension if all source files in the target directory have the same extension. An include statement for the header file will be inserted into the new source file.

When creating a C++ source file from a header containing namespaces, these namespace blocks will be generated too. Check out the settings for various ways to customize this behavior, or to disable namespace generation.

After the file is created, you will also be asked if you want to add definitions for functions declared in the header file.
