#!/usr/local/bin/node
"strict";
var fse = require('fs-extra');
var path = require('path'), posixPath = path.posix;
var xmlEscape = require('xml-escape');
var colors = require('colors/safe');
var marked = require('marked');
var glob = require('glob');

function fileExistsWithCaseSync(filepath) {
	filepath = path.resolve(filepath);
	var dir = path.dirname(filepath);
	if (dir === '/' || dir === '.') return true;
	var filenames = fse.readdirSync(dir);
	if (filenames.indexOf(path.basename(filepath)) === -1) {
		return false;
	}
	return fileExistsWithCaseSync(dir);
}

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
	index = JSON.parse(JSON.stringify(index));

	function fuzzyGlob(template, name) {
		var list = [];
		function addToList(more) {
			more.forEach(function (item) {
				if (list.indexOf(item) === -1 && fileExistsWithCaseSync(item)) {
					list.push(item);
				}
			});
		}
		function match(pattern) {
			if (!/\*/.test(pattern)) {
				return fileExistsWithCaseSync(pattern) ? [pattern] : [];
			}
			return glob.sync(pattern);
		}
		[].concat(template).forEach(function (template) {
			[name, name.toUpperCase(), name.toLowerCase()].forEach(function (name) {
				addToList(match(template.replace('{package}', name)));
				addToList(match(template.replace('{package}', name.replace(/ /g, '-'))));
				addToList(match(template.replace('{package}', name.replace(/-/g, ' '))));
			});
		});
		return list;
	}
	function addLinksToMarkdown(markdown, pack) {
		var links = [];
		[].concat(pack.links.audio || []).forEach(function (href) {
			links.push('[audio demo](' + href + ')');
		});
		[].concat(pack.links.presets || []).forEach(function (href) {
			links.push('[presets](' + href + ')');
		});
		[].concat(pack.links.youtube || []).forEach(function (href) {
			links.push('[YouTube](' + href + ')');
		});
		if (links.length) {
			markdown = 'Links: ' + links.join(' / ') + '\n\n' + markdown;
		}
		return markdown;
	}

	var releases = collectReleases();
	var categories = {};
	for (var name in index.packages || {}) {
		var pack = index.packages[name];
		categories[pack.category] = categories[pack.category] || {};
		categories[pack.category][name] = pack;
		pack.links = pack.links || {};
		if (typeof pack.sort === 'undefined') {
			pack.sort = Infinity;
		}

		for (var globKey in index.globFields || {}) {
			var files = fuzzyGlob(index.globFields[globKey], name);
			if (files.length == 1) {
				pack[globKey] = files[0];
			} else if (files.length > 1) {
				pack[globKey] = files;
			}
		}
		for (var globKey in index.globLinks || {}) {
			if (!pack.links[globKey]) {
				var files = fuzzyGlob(index.globLinks[globKey], name);
				if (files.length) {
					//console.log(globKey, name, index.globLinks[globKey], files);
					pack.links[globKey] = files;
				}
			}
		}
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
		var rtf = require('./markdown-to-rtf')(markdown, {baseUrl: index.url + '/'});
		//fse.writeFileSync('README.rtf', rtf);
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
					markdown = addLinksToMarkdown(markdown, pack);
					markdown = addRelativeMarkdownLinks(markdown, path.dirname(pack.readme));
					var rtf = require('./markdown-to-rtf')(markdown, {baseUrl: index.url + '/'});
					//fse.writeFileSync(name + '.rtf', rtf);
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
					open('version', {name: release.version, author: release.author || index.author, time: release.time});
						for (var file in release.files) {
							var entry = release.files[file];
							open('source', {file: file, platform: entry.platform, type: entry.type, main: entry.main ? 'true' : null}, true);
							result += xmlEscape(pathToUrl(path.join(release.path, file)));
							close('source', true);
							result += '\n';
						}
						if (release.changeLog) {
							open('changelog', {}, true);
							result += '<![CDATA[' + release.changeLog + ']]>';
							close('changelog', true);
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
	return index;
}

var index = readJson('reapack.json', {name: 'Unnamed repo - CHANGE ME'});
function writeIndex(args) {
	args = args || {_:[]};

	var urlPrefix = index.url = args._[1] || index.url || 'http://example.com';
	urlPrefix = urlPrefix.replace(/\/$/, '') + '/';
	var filledIndex = generateIndexXml(index, urlPrefix);
	writeJson('reapack.json', index);

	if (filledIndex.homepage) {
		writeHomepage(filledIndex);
	}
}

function addRelativeMarkdownLinks(markdown, prefix) {
	return markdown.replace(/\[([^\]]+)]\(([^\)]+)\)/g, function (match, text, link) {
		link = path.posix.join(prefix, link);
		if (require('fs').existsSync(link)) {
			return '[' + text + '](' + link + ')';
		} else {
			return match;
		}
	});
}

function writeHomepage(index) {
	var outputFile = typeof index.homepage === 'string' ? index.homepage : 'index.html';
	var html = `<!DOCTYPE html>
<html>
	<head>
		<title>Homepage</title>
	</head>
	<body>
		<!--reapack:readme-->
			Main README gets inserted here
		<!--/reapack:readme-->

		<!--reapack:nav-->
			Navigation section gets auto-inserted here
		<!--/reapack:nav-->

		<hr>
		<!--reapack:packages-->
			All packages get inserted here
		<!--/reapack:packages-->
	</body>
</html>`;
	try {
		html = require('fs').readFileSync(outputFile, 'utf8');
	} catch (e) {
		// Eh...
	}
	function getHtml(mdFile) {
		var prefix = path.dirname(mdFile);
		var markdown = require('fs').readFileSync(mdFile, 'utf8');
		markdown = addRelativeMarkdownLinks(markdown, prefix);
		return marked(markdown);
	}

	function replace(key, value) {
		var start = '<!--reapack:' + key + '-->';
		var end = '<!--/reapack:' + key + '-->';
		var parts = html.split(start);
		for (var i = 1; i < parts.length; i++) {
			var innerParts = parts[i].split(end);
			if (typeof value === 'function') {
				value = value();
			}
			innerParts[0] = '\n' + value + '\n';
			parts[i] = innerParts.join(end);
		}
		html = parts.join(start);
	}

	function htmlEscape(text) {
		return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
	}

	function packageHtml(pack, key) {
		var html = '';
		var links = [];
		[].concat(pack.links.audio || []).forEach(function (href) {
			links.push('<audio controls preload="none" src="' + htmlEscape(href) + '"></audio>');
		});
		[].concat(pack.links.presets || []).forEach(function (href) {
			links.push('<a href="' + htmlEscape(href) + '" target="_blank">presets</a>');
		});
		[].concat(pack.links.youtube || []).forEach(function (href) {
			links.push('<a href="' + htmlEscape(href) + '" target="_blank">YouTube</a>');
		});
		if (links.length) {
			html += '<div class="reapack-links">';
			html += links.join('');
			html += '</div>';
		}

		if (pack.readme) {
			html += getHtml(pack.readme);
		} else {
			html += '<h1>' + htmlEscape(key) + '</h1>';
		}
		return html;
	}

	replace('readme', getHtml(index.readme));

	function compareKeys(a, b) {
		var packA = index.packages[a], packB = index.packages[b];
		if (packA.sort < packB.sort) return -1;
		if (packA.sort > packB.sort) return 1;
		return (a < b) ? -1 : 1;
	}

	replace('nav', function () {
		var keys = Object.keys(index.packages);
		keys = keys.filter(function (key) {return !index.packages[key].hidden});
		keys.sort(compareKeys);

		var categories = {};
		var categoryKeys = [];
		keys.forEach(function (key) {
			var pack = index.packages[key];
			var category = pack.category;
			if (!categories[category]) {
				categories[category] = [];
				categoryKeys.push(category);
			}
			categories[category].push(key);
		});
		return '<div class="reapack-nav">' + categoryKeys.map(function (category) {
			var html = '<h3>' + htmlEscape(category) + '</h3>';
			return html + '<ul>' + categories[category].map(function (key) {
				var pack = index.packages[key];
				var html = '<a href="#' + htmlEscape(key) + '">' + htmlEscape(key) + '</a>';
				if (pack.summary) {
					html += ' - ' + marked(pack.summary).replace(/<p>|<\/p>/g, '');
				} else {
					html += ' - ' + htmlEscape(pack.category + ' ' + pack.type);
				}
				if (false && pack.links.audio) {
					[].concat(pack.links.audio).forEach(function (href, index) {
						if (index === 0) {
							html += ' (<a href="' + htmlEscape(href) + '">AUDIO</a>)';
						} else {
							html += ' (<a href="' + htmlEscape(href) + '">audio demo ' + (index + 1) + '</a>)';
						}
					});
				}
				return '<li>' + html + '</li>';
			}).join('\n') + '</ul>';
		}).join('\n') + '</div>';
	});

	replace('packages', function () {
		var keys = Object.keys(index.packages);
		keys = keys.filter(function (key) {return !index.packages[key].hidden});
		keys.sort(compareKeys);
		return keys.map(function (key) {
			return '<div class="reapack-package" id="' + htmlEscape(key) + '">' + packageHtml(index.packages[key], key) + '</div>';
		}).join('\n');
	});

	require('fs').writeFileSync(outputFile, html);
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
		var names = Object.keys(index.packages);
		names.sort();
		names.forEach(function (name, i) {
			var pack = index.packages[name];
			console.log(i + '\t' + colors.cyan(name) + ' (' + pack.type + ' in "' + pack.category + '")');
		});
	})
	.command('install', 'Installs into REAPER as if from ReaPack (for development)', function (yargs) {
		return yargs
			.usage('Usage: $0 install <REAPER-data-directory>')
			.demand(1, 1, 'Missing REAPER data directory');
	}, function (args) {
		var reaperDir = args._[1];
		for (var name in index.packages) {
			var pack = index.packages[name];
			var typeFolders = {
				'script': 'Scripts',
				'effect': 'Effects',
				'data': 'Data',
				'extension': 'UserPlugins',
				'theme': 'ColorThemes',
				'langpack': 'LangPack',
				'webinterface': 'reaper_www_root',
			};
			if (!typeFolders[pack.type]) {
				console.log('Cannot install pack type: ' + pack.type);
				continue;
			}

			var packDir = path.join(reaperDir, typeFolders[pack.type]);
			if (pack.type == 'script' || pack.type == 'effect') {
				packDir = path.join(packDir, index.name, pack.category);
			}
			var subDir = pack.prefix || friendlyName(name);
			packDir = path.join(packDir, subDir);
			fse.ensureDirSync(packDir);
			for (var filename in pack.files) {
				var newFile = path.join(packDir, filename);
				fse.copySync(filename, newFile);
				console.log('installed: ' + path.relative(reaperDir, newFile));
			}
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
		var names = Object.keys(index.packages);
		names.sort();
		if (/^[0-9]+$/.test(name) && names[name]) {
			name = names[name];
		}

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
	.command('refresh', 'Refreshes index / homepage', function (yargs) {
		writeIndex();
	})
	.command('release', 'Generates a release', function (yargs) {
		return yargs
			.usage("Usage: $0 release <package-name> [<version-id>] [changeLog]")
			.option('changeLog', {
				describe: 'changeLog message for this version'
			})
			.option('out', {
				describe: 'Output directory - defaults to releases/<package>/<version>'
			})
			.strict()
			.help();
	}, function createRelease(args) {
		var name = args._[1];
		var names = Object.keys(index.packages);
		names.sort();
		if (/^[0-9]+$/.test(name) && names[name]) {
			name = names[name];
		}

		if (!name) {
			console.log('No package name supplied - use \"*\" to bump version for all packages');
			process.exit(1);
		}

		var version = args._[2];
		var packages = index.packages = index.packages || {};

		var changeLog = args._[3];

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

		if (!version || version === '-') {
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

		var targetDir = args.out;
		if (!targetDir) {
			targetDir = 'releases/' + friendlyName(name) + '/' + friendlyName(version);
		}
		var subDir = pack.prefix || friendlyName(name);
		fse.ensureDirSync(targetDir);

		pack.version = version;
		var release = JSON.parse(JSON.stringify(pack));
		release.package = name;
		release.time = (new Date()).toISOString();
		if (args.changeLog) release.changeLog = args.changeLog;

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
