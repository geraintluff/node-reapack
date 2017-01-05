"strict";
var markdown = require('markdown').markdown;

function escapeRtf(text) {
	return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/[^\x00-\x7f]/g, function (char) {
		var code = char.charCodeAt(0);
		var padded = ('000000' + code).substr(-6);
		return '\\ud{\\uc6\\u' + padded + '}';
	}).replace(/\t/g, '\tab');
}

function treeToRtf(tree) {
	if (typeof tree === 'string') return escapeRtf(tree);
	tree = tree.slice(0);
	var type = tree.shift();

	var attributes = {};
	if (typeof tree[0] === 'object' && !Array.isArray(tree[0])) {
		attributes = tree.shift();
	}

	if (!convertors[type]) {
		return escapeRtf('(' + type + ')') + tree.map(treeToRtf).join('');
	}
	return convertors[type](attributes, tree.map(treeToRtf).join(''));
}

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
		return '{\\par ' + children + '}\\line';
	},
	listitem: function (attrs, children) {
		return '\\bullet\\tab ' + children + '\\line ';
	},
	strong: function (attrs, children) {
		return '\\b ' + children + '\\b0 ';
	},
	em: function (attrs, children) {
		return '\\i ' + children + '\\i0 ';
	},
	link: function (attrs, children) {
		return children + ' <' + escapeRtf(attrs.href) + '>';
	}
};

module.exports = function (md) {
	var tree = markdown.parse(md);
	
	return treeToRtf(tree);
};