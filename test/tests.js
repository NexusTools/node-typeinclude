var assert = require('assert');
var child_process = require("child_process");
var path = require('path');

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
		typeinclude.removeclasspath(path.dirname(__dirname) + path.sep + "node_modules");
	});
	test('verify classpath', function(){
        assert.equal(typeinclude.classpath()[0], __dirname);
	});
    
	test('resolve', function(){
        assert.equal(typeinclude.resolve("include"), __dirname + path.sep + "include.ts");
	});
	test('use classpath function', function(){
		typeinclude.addclasspath(function(script, classpath, scriptFile) {
            return path.resolve(__dirname, scriptFile);
        });
		typeinclude.removeclasspath(__dirname);
        assert.equal(typeinclude.classpath().length, 1);
	});
    
	test('resolve again', function(){
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
	test('@plugin', function(){
        typeinclude.addclasspath([[__dirname + path.sep + "all"]]);
        var All = typeinclude("All");
        assert.equal((new All()).doBelong(), "All Your Base Are Belong To Us");
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
	test('@strip', function(){
        var StripTest = typeinclude("strip");
        var instance = new StripTest();
		assert.equal(instance.test(42), 160.44);
	});
	test('@main', function(){
		var mainTest = typeinclude("main");
		assert.equal(mainTest instanceof Function, true);
	});
	var bigtest;
	test('compile bigtest', function(){
        typeinclude.addclasspath([[__dirname + path.sep + "bigtest"]]);
		bigtest = typeinclude("BigTest");
	});
	test('run bigtest', function(){
		assert.equal((new bigtest()).run(2), 16);
	});
	test('cleanup', function(){
		typeinclude.clean();
	});
});
