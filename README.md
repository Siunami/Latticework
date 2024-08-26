# Latticework Prototype

This repository contains a research prototype of Latticework, implemented as an Obsidian plugin. Latticework is a system designed to unify annotation with freeform text editing in the context of personal knowledge management tools.

You can read more about its goals and design in the research report: [https://www.matthewsiu.com/Latticework](https://www.matthewsiu.com/Latticework)

## Important Note

This prototype is an experimental implementation that doesn't fully realize all the features described in our research report. We're sharing it primarily as a reference implementation that provided us insights during the research process.

We recommend against building directly upon this codebase. Instead, we encourage using this prototype as inspiration for future implementations of these ideas.

## To install

![](brat.png)
In Obsidian's community plugins menu option, browse and install a the BRAT plugin. We'll use this to install Latticework from this github repo.

Once installed, activate the plugin, go to the setting for BRAT and click the `add beta plugin` button. We'll then paste the link to this repository [https://github.com/Siunami/Latticework/](https://github.com/Siunami/Latticework/)

Lastly, confirm that the `Latticework (Prototype)` plugin version `0.1.8` is installed and active in the community plugins menu option.

## Prototype commands

`CMD + Shift + H` - Creates a highlight + adds a text reference to adjacent document (if it exists, otherwise to the bottom of current document)

`CMD + Shift + C` - Copy command that copies a text reference

`Shift + Click` - Collapse or expand a text reference

`CMD + Shift + S` - Collapse or expand all

When hovering a text reference or backlink, hold `CMD` to peek it's destination document and location in an adjacent panel. While holding `CMD`, you can click to keep that panel open.

While hovering a backlink, click to add/edit a marginalia note alongside
