# Command-line (Node.js module) for ReaPack index file generation

This is an index generator and release manager for a ReaPack collection (REAPER effects, themes, etc.) hosted on a static site (e.g. GitHub Pages, or your own web-server).  It is written in Node (JavaScript).

## How it works

The state is stored in `reapack.json`, and this is used to generate the `index.xml` used by ReaPack.  (Do not modify `index.xml`, your changes will be overwritten.)

Each release copies the applicable files to a new release folder, with a JSON file (`reapack-version.json`) describing that release.  To create `index.xml`, the directory is scanned for `reapack-version.json` files.

## How to install

```
npm install -g reapack
```

## How to use it

The command-line attempts to be intuitive (use `--help` on any command to get more information), but here are some examples to get started:

View the index and list all packages:

```
> node reapack index

Geraint's JSFX
--------------
README: README.md
links:
           website:     https://geraintluff.github.io/jsfx/
packages:
        Bad Connection (effect in "Distortion")
        Dual Distortion (effect in "Distortion")
        Spectrum Matcher (effect in "Utility")
```

View a package:

```
> node reapack package "Bad Connection"
Bad Connection
--------------
type:           effect
category:       Distortion
version:        1.0.1
files:
        Bad Connection.jsfx
        ui-lib.jsfx-inc
links:
        screenshot: Bad Connection.png
```

Add/remove files:

```
> node reapack package "Bad Connection" --add "some-file.jsfx" --remove "other-file.jsfx"
```

Simulate a ReaPack install (useful when developing your effects):

```
> node reapack install C:\Users\Geraint\AppData\Roaming\REAPER
```

## TODO

There are some missing features (e.g. a command to add links, remove/rename packages), which at the moment are only possible by editing `reapack.json` by hand.