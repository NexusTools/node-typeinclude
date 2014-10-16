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
	test('resolve', function(){
		typeinclude.resolve("include", __dirname);
	});
	
	test('compile', function(){
		var compiledPath = typeinclude.compile("class", __dirname);
        var compiledInstance = require(compiledPath);
        assert.equal(compiledInstance.something(2.5), 207.5);
	});
	test('typeinclude + @include', function(){
		var clazz = typeinclude("include", __dirname);
		assert.equal(clazz.something(2.5), 207.5);
	});
	test('@reference', function(){
		var clazz = typeinclude("reference", __dirname);
		var instance = new clazz();
		assert.equal(instance.method(), "Father");
		instance = new clazz(3);
		assert.equal(instance.method(), "Fat");
	});
	test('@nodereq', function(){
		var pathJoin = typeinclude("nodereq", __dirname);
		assert.equal(pathJoin(), "/test/folder");
	});
	test('@main', function(){
		var mainTest = typeinclude("main", __dirname);
		assert.equal(mainTest instanceof Function, true);
	});
	var bigtest;
	test('compile bigtest', function(){
		bigtest = typeinclude("BigTest", __dirname + path.sep + "bigtest");
	});
	test('run bigtest', function(){
		assert.equal((new bigtest()).run(2), 16);
	});
});
