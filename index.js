"strict";
var fse = require('fs-extra');
var path = require('path'), posixPath = path.posix;
var xmlEscape = require('xml-escape');
var colors = require('colors/safe');

function readJson(file, defaultValue) {
	try {
		return JSON.parse(fse.readFileSync(file, {encoding: 'utf-8'}));
	} catch (e) {
		if (defaultValue && e.code == 'ENOENT') return defaultValue;
		console.error("Error reading: " + file);
		console.error('\t' + e.message);
		process.exit(1);
	}
}
function writeJson(file, json) {
	fse.outputFileSync(file, JSON.stringify(json, null, '\t'));
	addToGit(file);
}

function friendlyName(name) {
	return name.replace(/[^a-z0-9\._\-]+/gi, '-');
}

function compareVersions(a, b) {
	a = a.split('.');
	b = b.split('.');
	for (var i = 0; i < a.length && i < b.length; i++) {
		var aNum = parseFloat(a[i]), bNum = parseFloat(b[i]);
		if (aNum > bNum) return 1;
		if (aNum < bNum) return -1;
		if (a > b) return 1;
		if (a < b) return -1;
	}
	return a.length - b.length;
}

function incrementVersion(a) {
	var parts = a.split('.');
	var last = parts.pop();
	var newLast = last.replace(/[0-9]+/, function (number) {
		return parseFloat(number) + 1;
	});
	last = (newLast == last) ? last + '2' : newLast;
	parts.push(last);
	return parts.join('.');
}

function collectReleases(releases, directory) {
	releases = releases || {};
	directory = directory || '.';
	var entries = fse.readdirSync(directory);
	entries.forEach(function (child) {
		if (/^\./.test(child)) return;
		var full = path.join(directory, child);
		var stats = fse.statSync(full);
		if (stats.isDirectory()) {
			collectReleases(releases, full);
		} else if (child == "reapack-version.json") {
			var release = readJson(full);
			release.path = directory;
			if (release.package && release.version && release.files) {
				var name = release.package;
				(releases[name] = releases[name] || []).push(release);
			}
		}
	});
	return releases;
}

function generateIndexXml(index, urlPrefix) {
	var result = '<?xml version="1.0" encoding="utf-8"?>\n';
	var indentLevel = 0;
	
	var releases = collectReleases();
	var categories = {};
	for (var name in index.packages || {}) {
		var pack = index.packages[name];
		categories[pack.category] = categories[pack.category] || {};
		categories[pack.category][name] = pack;
	}
	
	function indent() {
		return (new Array(indentLevel + 1)).join('\t');
	}
	function open(tag, attributes, inline) {
		result += indent() + '<' + tag;
		for (var key in attributes || {}) {
			if (attributes[key] != null) {
				result += ' ' + key + '="' + xmlEscape(attributes[key] + "") + '"';
			}
		}
		result += '>';
		if (!inline) result += '\n';
		indentLevel++;
	}
	function close(tag, inline) {
		indentLevel--;
		if (!inline) result += indent();
		result += '</' + tag + '>';
		if (!inline) result += '\n';
	}
	function pathToUrl(file) {
		return urlPrefix + posixPath.normalize(file).split(/[\\\/]/g).map(encodeURIComponent).join('/');
	}
	
	// Generate XML
	open('index', {version: 1, name: index.name, 'generated-by': 'https://www.npmjs.com/package/reapack'});
	open('metadata');
	if (index.readme) {
		var markdown = fse.readFileSync(index.readme, {encoding: 'utf-8'});
		var rtf = require('./markdown-to-rtf')(markdown);
		open('description', {}, 1);
		result += xmlEscape(rtf + "");
		close('description', 1);
		result += '\n';
	}
	for (var rel in index.links || {}) {
		[].concat(index.links[rel]).forEach(function (url) {
			if (!/\:\/\//.test(url)) {
				url = pathToUrl(url);
			}
			open('link', {rel: rel}, 1);
			result += xmlEscape(url);
			close('link', 1);
			result += '\n';
		});
	}
	close('metadata');
	for (var key in categories) {
		open('category', {name: key});
			for (var name in categories[key]) {
				var pack = categories[key][name];
				open('reapack', {name: name, type: pack.type, desc: pack.description});
				open('metadata');
				if (pack.readme) {
					var markdown = fse.readFileSync(pack.readme, {encoding: 'utf-8'});
					var rtf = require('./markdown-to-rtf')(markdown);
					open('description', {}, 1);
					result += xmlEscape(rtf + "");
					close('description', 1);
					result += '\n';
				}
				for (var rel in pack.links || {}) {
					[].concat(pack.links[rel]).forEach(function (url) {
						if (!/\:\/\//.test(url)) {
							url = pathToUrl(url);
						}
						open('link', {rel: rel}, 1);
						result += xmlEscape(url);
						close('link', 1);
						result += '\n';
					});
				}
				close('metadata');
				(releases[name] || []).forEach(function (release) {
					open('version', {name: release.version, author: release.author, time: release.time});
						for (var file in release.files) {
							var entry = release.files[file];
							open('source', {file: file, platform: entry.platform, type: entry.type, main: entry.main ? 'true' : null}, true);
							result += xmlEscape(pathToUrl(path.join(release.path, file)));
							close('source', true);
							result += '\n';
						}
					close('version');
				});
				close('reapack');
			}
		close('category');
	}
	close('index');
	
	fse.outputFileSync('index.xml', result);
	addToGit('index.xml');
	return result;
}

var index = readJson('reapack.json', {name: 'Unnamed repo - CHANGE ME'});
function writeIndex(args) {
	args = args || {_:[]};

	var urlPrefix = index.url = args._[1] || index.url || 'http://example.com';
	urlPrefix = urlPrefix.replace(/\/$/, '') + '/';
	generateIndexXml(index, urlPrefix);
	writeJson('reapack.json', index);
}

var useGit = index.git;
function addToGit(file, args) {
	if (useGit) {
		require('child_process').execFileSync('git', ['add', file], {stdio: ['ignore', 'ignore', 'pipe']});
	}
}

function leftPad(str, length) {
	while (str.length < length) {
		str = ' ' + str;
	}
	return str;
}

var args = require('yargs')
	.usage('Usage: $0 <command>')
	.command('index', 'Create/update the index, list all packages', function (yargs) {
		return yargs
			.usage('Usage: $0 index')
			.option('base', {describe: 'Base URL where this repository is hosted (as static files)'})
			;
	}, function (args) {
		if (args.base) {
			index.url = args.base;
		}
		
		console.log(colors.bold(index.name));
		console.log(new Array(index.name.length + 1).join('-'));
		console.log('README:\t' + index.readme);
		console.log('base URL:\t' + colors.cyan(index.url || 'http://example.com'));
		console.log('links:');
		for (var rel in index.links || {}) {
			[].concat(index.links[rel]).forEach(function (url) {
				console.log('\t' + colors.red(leftPad(rel, 10)) + ':\t' + url);
			});
		}
		console.log('packages:');
		for (var name in index.packages || {}) {
			var pack = index.packages[name];
			console.log('\t' + colors.cyan(name) + ' (' + pack.type + ' in "' + pack.category + '")');
		}
	})
	.command('package', 'Create/update a package', function (yargs) {
		return yargs
			.usage("Usage: $0 package <package-name>")
			.demand(1, 1, "Missing package name")
			.option('category', {
				describe: 'sets category'
			})
			.option('type', {
				describe: 'sets package type',
				choices: ['script', 'effect', 'extension', 'data', 'theme']
			})
			.option('add', {
				describe: 'add a file',
			})
			.option('remove', {
				describe: 'remove a file',
			})
			.option('main', {
				describe: 'set a file to be "main" (for scripts)',
			})
			.strict()
			.help();
	}, function (args) {
		var name = args._[1];
		var packages = index.packages = index.packages || {};
		var pack = packages[name] = packages[name] || {type: 'effect', category: 'Misc'};
		
		var files = pack.files = pack.files || {};
		[].concat(args.add || []).forEach(function (file) {
			files[file] = files[file] || {main: false};
		});
		[].concat(args.main || []).forEach(function (file) {
			(files[file] = files[file] || {}).main = true;
		});
		[].concat(args.remove || []).forEach(function (file) {
			delete files[file];
		});
		
		console.log(colors.bold(name));
		console.log(new Array(name.length + 1).join('-'));
		console.log('type:    \t' + pack.type);
		console.log('category:\t' + colors.cyan(pack.category));
		console.log('version: \t' + (pack.version || 'unreleased'));
		console.log('files:');
		for (var filename in pack.files) {
			var fileEntry = pack.files[filename];
			if (fileEntry.main) {
				console.log('\t' + colors.bold(filename) + colors.red(' (main)'));
			} else {
				console.log('\t' + colors.bold(filename));
			}
		}
		console.log('links:');
		for (var rel in pack.links || {}) {
			[].concat(pack.links[rel]).forEach(function (url) {
				console.log('\t' + colors.red(rel) + ': ' + url);
			});
		}
		
		writeJson('reapack.json', index);
		writeIndex();
	})
	.command('release', 'Generates a release', function (yargs) {
		return yargs
			.usage("Usage: $0 release <package-name> [<version-id>]")
			.option('out', {
				describe: 'Output directory - defaults to releases/<package>/<version>'
			})
			.strict()
			.help();
	}, function createRelease(args) {
		var name = args._[1];
		
		if (!name) {
			console.log('No package name supplied - use \"*\" to bump version for all packages');
			process.exit(1);
		}
		
		var version = args._[2];
		var packages = index.packages = index.packages || {};
		
		if (name == '*') {
			var out = args.out;
			for (var key in packages) {
				args._[1] = key;
				if (out) {
					args.out = path.posix.join(out, friendlyName(key));
				}
				createRelease(args);
			}
			return;
		}

		var pack = packages[name];
		if (!pack) {
			console.error("Package not found: " + name);
			process.exit(1);
		}
		
		if (!version) {
			if (pack.version) {
				version = incrementVersion(pack.version + "");
			} else {
				var versions = collectReleases()[name];
				if (versions) {
					versions.sort(function (a, b) {
						return compareVersions(a.version, b.version);
					});
					var latest = versions.pop();
					version = incrementVersion(latest.version);
				} else {
					version = '1.0.0';
				}
			}
		}
		
		var targetDir = args._[3];
		if (!targetDir) {
			targetDir = 'releases/' + friendlyName(name) + '/' + friendlyName(version);
		}
		var subDir = pack.prefix || friendlyName(name);
		fse.ensureDirSync(targetDir);
		
		pack.version = version;
		var release = JSON.parse(JSON.stringify(pack));
		release.package = name;
		release.time = (new Date()).toISOString();

		release.files = {};
		for (var file in pack.files) {
			var newFile = path.join(targetDir, subDir, file);
			release.files[path.posix.join(subDir, file)] = pack.files[file];
			fse.copySync(file, newFile);
			addToGit(newFile);
		}
		
		writeJson(path.join(targetDir, 'reapack-version.json'), release);
		
		console.log(name + ' v' + version + ': ' + targetDir);
		writeJson('reapack.json', index);
		
		writeIndex();
	})
	.demand(1)
	.strict()
	.help()
	.argv;
