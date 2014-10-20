var assert = require('assert')
var child_process = require("child_process");
var path = require('path')

suite('typeinclude', function() {
	var typeinclude;
	test('index.js', function(){
		typeinclude = require(path.dirname(__dirname) + path.sep + "index");
	});
	test('clean', function(){
		typeinclude.clean();
	});
    var cClassPath;
	test('classpath', function(){
		cClassPath = typeinclude.classpath()[0];
        assert.equal(typeinclude.hasclasspath(cClassPath), true);
	});
	test('addclasspath', function(){
		typeinclude.addclasspath(__dirname);
	});
	test('removeclasspath', function(){
		typeinclude.removeclasspath(cClassPath);
	});
	test('verify classpath', function(){
        assert.equal(typeinclude.classpath()[0], __dirname);
	});
    
	test('resolve', function(){
        assert.equal(typeinclude.resolve("include"), __dirname + path.sep + "include.ts");
	});
	
	test('compile', function(){
		var compiledInstance = typeinclude("class");
        assert.equal(compiledInstance.something(2.5), 207.5);
	});
	test('@include', function(){
		var clazz = typeinclude("include");
		assert.equal(clazz.something(2.5), 207.5);
	});
	test('@reference', function(){
		var clazz = typeinclude("reference");
		var instance = new clazz();
		assert.equal(instance.method(), "Father");
		instance = new clazz(3);
		assert.equal(instance.method(), "Fat");
	});
	test('@nodereq', function(){
		var pathJoin = typeinclude("nodereq");
		assert.equal(pathJoin(), "/test/folder");
	});
	test('@target', function(){
        var ES5Test = typeinclude("es5");
        var instance = new ES5Test();
        instance.test = 5;
		assert.equal(instance.test, 10);
	});
	test('@main', function(){
		var mainTest = typeinclude("main");
		assert.equal(mainTest instanceof Function, true);
	});
	var bigtest;
	test('compile bigtest', function(){
        typeinclude.removeclasspath(__dirname);
        typeinclude.addclasspath(__dirname + path.sep + "bigtest");
		bigtest = typeinclude("BigTest");
	});
	test('run bigtest', function(){
		assert.equal((new bigtest()).run(2), 16);
	});
	test('cleanup', function(){
		typeinclude.clean();
	});
});
