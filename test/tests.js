var assert = require('assert');
var child_process = require("child_process");
var path = require('path');

var pkg;
var topDir = path.dirname(__dirname);
it('parse package.json', function(){
    var pkgfile = path.resolve(topDir, "package.json");
    pkg = require(pkgfile);
    if(!pkg)
        throw new Error("Failed to parse `" + rel + "`");
    if(!("main" in pkg))
        throw new Error("`" + rel + "` missing property `main`");
});
var _ti;
it("require main", function(){
    _ti = require(topDir);
});
var typeinclude;
it('create instance', function(){
    typeinclude = _ti(topDir + "/");
});
describe('api', function() {
	it('clean', function(){
		typeinclude.clean();
	});
    describe('classpath', function() {
        var cClassPath;
        it('get/has', function(){
            cClassPath = typeinclude.classpath().at(0);
            assert.equal(typeinclude.hasclasspath(cClassPath), true);
        });
        it('clear', function(){
            typeinclude.clearclasspath();
        });
        it('add', function(){
            typeinclude.addclasspath(__dirname);
        });
        it('verify', function(){
            assert.equal(typeinclude.classpath().at(0), __dirname);
        });
        it('resolve', function(){
            assert.equal(typeinclude.resolve("include"), path.resolve(__dirname, "include.ts"));
        });
    });
    describe('nodepath', function() {
        var cNodePath;
        it('get/has', function(){
            cNodePath = typeinclude.nodepath().at(0);
            assert.equal(typeinclude.hasnodepath(cNodePath), true);
        });
        it('resolve/require \"mkdirp\"', function(){
            require(typeinclude.resolvenode("lodash"));
        });
        it('resolve/require \"lodash\"', function(){
            require(typeinclude.resolvenode("lodash"));
        });
        it('resolve \"typescript\" and tsc', function(){
            typeinclude.resolvenode("typescript");
            typeinclude.resolvenode("typescript/bin/tsc");
        });
        it('resolve/require \"sleep\"', function(){
            var path = typeinclude.resolvenode("sleep");
            assert.equal(typeinclude.require("sleep"), require(path));
        });
    });
	describe('tsc + preprocessor', function() {
        it('compile', function(){
            var compiledInstance = typeinclude("class");
            assert.equal(compiledInstance.something(2.5), 207.5);
        });
        it('@include', function(){
            var clazz = typeinclude("include");
            assert.equal(clazz.something(2.5), 207.5);
        });
        it('@reference', function(){
            var clazz = typeinclude("reference");
            var instance = new clazz();
            assert.equal(instance.method(), "Father");
            instance = new clazz(3);
            assert.equal(instance.method(), "Fat");
        });
        it('@plugin', function(){
            typeinclude.addclasspath(__dirname + path.sep + "all");
            var All = typeinclude("All");
            assert.equal((new All()).doBelong(), "All Your Base Are Belong To Us");
        });
        it('@nodereq', function(){
            var pathJoin = typeinclude("nodereq");
            assert.equal(pathJoin(), "/test/folder");
        });
        it('@target', function(){
            var ES5Test = typeinclude("es5");
            var instance = new ES5Test();
            instance.test = 5;
            assert.equal(instance.test, 10);
        });
        it('@strip', function(){
            var StripTest = typeinclude("strip");
            var instance = new StripTest();
            assert.equal(instance.test(42), 160.44);
        });
        it('@main', function(){
            var mainTest = typeinclude("main");
            assert.equal(mainTest instanceof Function, true);
        });
        var bigtest;
        it('compile bigtest', function(){
            typeinclude.addclasspath(__dirname + path.sep + "bigtest");
            bigtest = typeinclude("BigTest");
        });
        it('run bigtest', function(){
            assert.equal((new bigtest()).run(2), 16);
        });
    });
});
var testsource = path.resolve(__dirname, "testsource");
describe('package.json test(main|source)', function() {
    var typeinclude;
    it('create instance', function(){
        typeinclude = _ti(testsource);
    });
    it('classpath verify', function(){
        assert.equal(typeinclude.classpath().at(0), path.resolve(testsource, "lib"));
    });
    var instance;
    it('typemain include', function(){
        instance = typeinclude();
    });
    it('test instance', function(){
        assert.equal(instance.yellow(), "yellowish");
    });

});

describe('coverage', function() {
    it('package.json error', function(){
        try {
            _ti(__dirname);
            throw new Error("Didn't fail");
        } catch(e) {
            if(!/Cannot find module /.test(e.message))
                throw e;
        }
    });
    it('cannot resolve error', function(){
        try {
            typeinclude("fake");
            throw new Error("Didn't fail");
        } catch(e) {
            if(!/Cannot resolve /.test(e.message))
                throw e;
        }
    });
	it('clean last', function(){
		typeinclude.clean();
	});

});
