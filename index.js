"strict";
var fse = require('fs-extra');
var path = require('path'), posixPath = path.posix;
var xmlEscape = require('xml-escape');

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
		for (var key in attributes) {
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
		return urlPrefix + posixPath.normalize(file).split('/').map(encodeURIComponent).join('/');
	}
	
	// Generate XML
	open('index', {version: 1, name: index.name});
	for (var key in categories) {
		open('category', {name: key});
			for (var name in categories[key]) {
				var pack = categories[key][name];
				open('reapack', {name: name, type: pack.type, desc: pack.description});
					(releases[name] || []).forEach(function (release) {
						open('version', {name: release.version, author: release.author, time: release.time});
							for (var file in release.files) {
								var entry = release.files[file];
								open('source', {file: file, platform: entry.platform, type: entry.type, main: entry.main ? 'true' : null}, true);
								result += xmlEscape(pathToUrl(file));
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
	console.log(result);
	return result;
}

var index = readJson('reapack.json', {name: 'Unnamed repo - CHANGE ME'});

var args = require('yargs')
	.usage('Usage: $0 <command>')
	
	.command('package', 'Create/update a package', function (yargs) {
		return yargs
			.usage("Usage: $0 create <package-name>")
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
			.option('main', {
				describe: 'set a file to be "main" (for scripts)',
			})
			.option('remove', {
				describe: 'remove a file',
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
		
		writeJson('reapack.json', index);
	})
	.command('release', 'Generates a release', function (yargs) {
		return yargs
			.usage("Usage: $0 release <package-name> [<version-id>]")
			.option('out', {
				describe: 'Output directory - defaults to releases/<package>/<version>'
			})
			.demand(1)
			.strict()
			.help();
	}, function (args) {
		var name = args._[1];
		var version = args._[2];

		var packages = index.packages = index.packages || {};
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
		fse.ensureDirSync(targetDir);
		
		pack.version = version;
		var release = JSON.parse(JSON.stringify(pack));
		release.package = name;
		release.time = (new Date()).toISOString();
		
		for (var file in release.files) {
			var newFile = path.join(targetDir, file);
			fse.copySync(file, newFile);
		}
		
		writeJson(path.join(targetDir, 'reapack-version.json'), release);
		
		console.log('Released v' + version + ' of ' + name + ': ' + targetDir);
		writeJson('reapack.json', index);
	})
	.command('index', 'Generate index.xml', function (yargs) {
		return yargs
			.usage("Usage $0 index [<url-prefix>]")
			.strict()
			.help();
	}, function (args) {
		var urlPrefix = index.url = args._[1] || index.url || 'http://example.com';
		urlPrefix = urlPrefix.replace(/\/$/, '') + '/';
		generateIndexXml(index, urlPrefix);
		writeJson('reapack.json', index);
	})
	.demand(1)
	.strict()
	.help()
	.argv;
