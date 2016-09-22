"strict";
var fs = require('fs');
var DOMParser = require('xmldom').DOMParser;
var XMLSerializer = require('xmldom').XMLSerializer;

function readIndex() {
	try {
		xml = fs.readFileSync('index.xml', {encoding: 'utf-8'});
		var parser = new DOMParser();
		return parser.parseFromString(xml, 'application/xml');
	} catch (e) {
		console.error('index.xml missing/corrupted:');
		console.error('\t' + e.message);
		process.exit(1);
	}
}
function writeIndex(document) {
	var index = document.documentElement;
	// Cull
	for (var i = 0; i < index.childNodes.length; i++) {
		var cat = index.childNodes[i];
		if (cat.tagName == 'category') {
			var packCount = 0;
			for (var j = 0; j < cat.childNodes.length; j++) {
				var pack = cat.childNodes[j];
				if (pack.tagName == 'reapack') {
					packCount++;
				}
			}
			if (!packCount) {
				index.removeChild(cat);
				i--;
			}
		}
	}
	
	var serialiser = new XMLSerializer();
	var xml = serialiser.serializeToString(document);
	try {
		fs.writeFileSync('index.xml', xml, {encoding: 'utf-8'});
	} catch (e) {
		console.error('Failed to write index:');
		console.error('\t' + e.message);
		process.exit(1);
	}
	return xml;
}
function findCategory(document, category) {
	var index = document.documentElement;
	for (var i = 0; i < index.childNodes.length; i++) {
		var child = index.childNodes[i];
		if (child.tagName == 'category' && child.getAttribute("name") == category) {
			return child;
		}
	}
	var child = document.createElement('category');
	child.setAttribute('name', category);
	index.appendChild(child);
	return child;
}
function findPackage(document, package, forceCategory) {
	var index = document.documentElement;
	for (var i = 0; i < index.childNodes.length; i++) {
		var cat = index.childNodes[i];
		if (cat.tagName == 'category') {
			for (var j = 0; j < cat.childNodes.length; j++) {
				var pack = cat.childNodes[j];
				if (pack.tagName == 'reapack' && pack.getAttribute('name') == package) {
					if (forceCategory && forceCategory != cat.getAttribute('name')) {
						cat.removeChild(pack);
						findCategory(document, forceCategory).appendChild(pack);
					}
					return pack;
				}
			}
		}
	}
}

var args = require('yargs')
	.usage('Usage: $0 <command>')
	
	.command('init', 'Generate an empty index.xml', function (yargs) {
		return yargs.option('name', {
			describe: 'Repository name (e.g. "Tina\'s JSFX Scripts")',
			demand: true
		});
	}, function (args) {
		var parser = new DOMParser();
		var document = parser.parseFromString('<?xml version="1.0" encoding="utf-8"?><index version="1"/>');
		var repo = document.documentElement;
		repo.setAttribute('name', args.name);
		writeIndex(document);
		console.log("Generated index.xml for: " + args.name);
	})
	.command('create', 'Creates a package', function (yargs) {
		return yargs
			.usage('Usage: $0 create <package-name> --category <category>')
			.demand(1, 1, 'Missing package name')
			.option('category', {
				describe: 'Category identifier (moves if different)',
				default: "Misc"
			})
			.option('type', {
				describe: 'Package type',
				demand: true,
				choices: ['effect', 'extension', 'script']
			});
	}, function (args) {
		var document = readIndex();
		var packageName = args._[1];
		var category = findCategory(document, args.category);
		var pack = findPackage(document, packageName);
		if (pack) {
			console.error('Package already exists');
			process.exit(1);
		}
		
		var pack = document.createElement('reapack');
		pack.setAttribute('name', packageName);
		category.appendChild(pack);
		console.log(writeIndex(document));
	})
	.recommendCommands()
	.demand(1)
	.strict()
	.help()
	.argv;
