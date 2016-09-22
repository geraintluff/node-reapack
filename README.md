# Command-line for ReaPack index file generation

This is an index generator and release manager for a ReaPack collection hosted on a static site.

The state is stored the (generated) `reapack.json` - do not modify `index.xml`, your changes will be overwritten.

Each release copies the applicable files to a new release folder, with a JSON file (`reapack-version.json`) describing that release.

The command-line attempts to be intuitive, so have a play around.