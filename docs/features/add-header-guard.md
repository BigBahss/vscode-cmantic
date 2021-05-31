---
layout: default
title: Add Header Guard
permalink: /features/add-header-guard/
nav_order: 8
parent: Features
---

### **Add Header Guard**

`Add Header Guard`/`Amend Header Guard` can be found in the `Source Actions...` menu.

The `Add Header Guard` command adds a header guard to the current header file. Based on the `Header Guard: Style` setting, C-mantic will insert either a conditional `#define` block, `#pragma once`, or both. `#define` names are generated based on the setting `Header Guard: Define Format`.

If the file already has a header guard that does not match your configured style, then the `Add Header Guard` command will "amend" the existing one to match your configuration. Additionally, if you select the header guard with your cursor, then `Amend Header Guard` will be suggested as a `Quick Fix`.
