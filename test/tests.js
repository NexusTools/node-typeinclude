var testCase = require('mocha').describe
var pre = require('mocha').before
var assertions = require('mocha').assertions
var path = require('path')
var assert = require('assert')

suite('typeinclude', function() {
	var typeinclude;
	test('index.js', function(){
		typeinclude = require(path.dirname(__dirname) + path.sep + "index");
	});
	var clazz;
	test('compile class', function(){
		clazz = typeinclude(__dirname + path.sep + "class.ts");
	});
	test('use class method', function(){
		assert.equal(clazz.something(2.5), 207.5);
	});
	test('@include', function(){
		var clazz = typeinclude(__dirname + path.sep + "include.ts");
		assert.equal(clazz.something(2.5), 207.5);
	});
	test('@nodereq', function(){
		var pathJoin = typeinclude(__dirname + path.sep + "nodereq.ts");
		assert.equal(pathJoin(), "/test/folder");
	});
});
