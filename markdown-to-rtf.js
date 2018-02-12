"strict";
var markdown = require('markdown').markdown;

function escapeRtf(text) {
	return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/[^\x00-\x7f]/g, function (char) {
		var code = char.charCodeAt(0);
		var padded = ('000000' + code).substr(-6);
		return '\\ud{\\uc6\\u' + padded + '}';
	}).replace(/\t/g, '\tab');
}

function treeToRtf(tree, options) {
	var convertors = {
		markdown: function (attrs, children) {
			return '{\\rtf1\\ansi\\fs24' + children + '}';
		},
		header: function (attrs, children) {
			var size = Math.round(48/attrs.level);
			size = ('00' + size).substr(-2);
			return '{\\fs' + size + '\\b ' + children + '\\b}\\line\\line ';
		},
		para: function (attrs, children) {
			return '' + children + '\\line\\line ';
		},
		bulletlist: function (attrs, children) {
			return '{\\par ' + children + '}\\line ';
		},
		listitem: function (attrs, children) {
			return '\\bullet\\tab ' + children + '\\line ';
		},
		inlinecode: function (attrs, children) {
			return '\\i\\ul ' + children + '\\ul0\\i0 '; // Underline and italics
		},
		strong: function (attrs, children) {
			return '\\b ' + children + '\\b0 ';
		},
		em: function (attrs, children) {
			return '\\i ' + children + '\\i0 ';
		},
		img: function (attrs, children) {
			if (false && options.directory && !/\:\/\//.test(attrs.href)) {
				var imagePath = require('path').resolve(options.directory, attrs.href);
				var imageBuffer = require('fs').readFileSync(imagePath);
				console.error('imageBuffer', imageBuffer.length);
				var blip = null;
				if (/\.png$/i.test(imagePath)) blip = '\\pngblip';
				if (/\.jpe?g$/i.test(imagePath)) blip = '\\jpegblip';
				if (blip) {
					return '{\\*\\shppict {\\pict ' + blip + ' ' + imageBuffer.toString('hex') + ' }}';
				}
			}
			return convertors.link(attrs, escapeRtf(attrs.alt));
		},
		link: function (attrs, children) {
			var href = attrs.href;
			if (options.baseUrl) {
				href = require('url').resolve(options.baseUrl, href);
			}
			return '{\\field{\\*\\fldinst{HYPERLINK ' + JSON.stringify(href) + '}}{\\fldrslt ' + children + '}}';
		}
	};

	if (typeof tree === 'string') return escapeRtf(tree);
	tree = tree.slice(0);
	var type = tree.shift();

	var attributes = {};
	if (typeof tree[0] === 'object' && !Array.isArray(tree[0])) {
		attributes = tree.shift();
	}

	if (!convertors[type]) {
		return escapeRtf('(' + type + ')') + tree.map(node => treeToRtf(node, options)).join('');
	}
	return convertors[type](attributes, tree.map(node => treeToRtf(node, options)).join(''));
}

module.exports = function (md, options) {
	var tree = markdown.parse(md);

	return treeToRtf(tree, options || {});
};

if (require.main === module) {
	var file = process.argv[2];
	var baseUrl = process.argv[3];
	if (file) {
		var md = require('fs').readFileSync(file, 'utf8');
		var rtf = module.exports(md, {
			baseUrl: baseUrl,
			directory: require('path').dirname(file)
		});
		console.log(rtf);
	}
}
