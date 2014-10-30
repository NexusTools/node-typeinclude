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
    typeinclude = _ti(topDir);
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
        
        
    
        
        it('use function'/*, function(){
            typeinclude.addclasspath(function(script, classpath, scriptFile) {
                return path.resolve(__dirname, scriptFile);
            });
            typeinclude.removeclasspath(__dirname);
            assert.equal(typeinclude.classpath().length, 1);
        }*/);

        it('resolve again'/*, function(){
            assert.equal(typeinclude.resolve("include"), __dirname + path.sep + "include.ts");
        }*/);
    });
    describe('nodepath', function() {
        var cNodePath;
        it('get/has', function(){
            cNodePath = typeinclude.nodepath().at(0);
            assert.equal(typeinclude.hasnodepath(cNodePath), true);
        });
        it('resolve \"mkdirp\"', function(){
            require(typeinclude.resolvenode("underscore"));
        });
        it('resolve \"underscore\"', function(){
            require(typeinclude.resolvenode("underscore"));
        });
        it('resolve \"typescript\"', function(){
            typeinclude.resolvenode("typescript");
            typeinclude.resolvenode("typescript/bin/tsc");
        });
        it('resolve \"sleep\"', function(){
            require(typeinclude.resolvenode("sleep"));
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
            typeinclude.addclasspath([[__dirname + path.sep + "all"]]);
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
            typeinclude.addclasspath([[__dirname + path.sep + "bigtest"]]);
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
    describe('paths.js', function() {
        var paths;
        it('require', function(){
            paths = require(path.resolve(topDir, "lib", "paths.js"));
        });
        var instance;
        describe('create', function() {
            it('using multiple args', function(){
                var test = new paths(__dirname, topDir);
                assert.equal(test.resolve("package.json"),
                             path.resolve(topDir, "package.json"));
                assert.equal(test.resolve("tests.js"), __filename);
            });
            it('using array arg', function(){
                var test = new paths([__dirname, topDir]);
                assert.equal(test.resolve("package.json"),
                             path.resolve(topDir, "package.json"));
                assert.equal(test.resolve("tests.js"), __filename);
            });
            it('using function arg', function(){
                var test = new paths(function(script) {
                    return script + ".json";
                });
                test.add([__dirname, topDir]);
                assert.equal(test.resolve("package"),
                             path.resolve(topDir, "package.json"));
            });
            it('string arg', function(){
                instance = new paths(topDir);
                assert.equal(instance.resolve("package.json"),
                             path.resolve(topDir, "package.json"));
            });
            it('unknown type error', function(){
                try {
                    new paths(new Date());
                    throw new Error("Didn't fail");
                } catch(e) {
                    if(!/Cannot handle /.test(e.message))
                        throw e;
                }
            });
        });
        describe('other', function() {
            it('isInstance, wrap', function(){
                assert.equal(paths.isInstance(instance), true);
                assert.equal(paths.wrap(instance), instance);
                assert.equal(paths.wrap(topDir).at(0), topDir);
                assert.equal(instance.count(), 1);
            });
            it('get, count', function(){
                assert.equal(instance.get(__dirname).at(0), __dirname);
                assert.equal(instance.get(__dirname, topDir).count(), 2);
                assert.equal(instance.get([__dirname, path.resolve(topDir, "lib")]).count(), 3);
            });
            it('get error', function(){
                try {
                    instance.get(new Date());
                    throw new Error("Didn't fail");
                } catch(e) {
                    if(!/Cannot handle /.test(e.message))
                        throw e;
                }
            });
            it('add', function(){
                instance.add(path.resolve(topDir, "lib"), topDir);
                instance.add(new paths(__dirname));
                instance.add(instance);
                instance.add([]);
                instance.add();
                
                assert.equal(instance.count(), 3);
            });
            it('add error', function(){
                try {
                    instance.add(new Date());
                    throw new Error("Didn't fail");
                } catch(e) {
                    if(!/Cannot handle /.test(e.message))
                        throw e;
                }
            });
            it('remove', function(){
                instance.remove([topDir, __dirname]);
                instance.remove(topDir, __dirname, path.resolve(topDir, "lib"));
                instance.remove(new paths());
                instance.remove(instance);
                instance.remove(topDir);
            });
            it('remove error', function(){
                try {
                    instance.remove(new Date());
                    throw new Error("Didn't fail");
                } catch(e) {
                    if(!/Cannot handle /.test(e.message))
                        throw e;
                }
            });
            it('forEach', function(){
                instance.forEach(function() {
                    throw new Error("Should be empty");
                });
            });
        });
    });
    describe('typescript.js', function() {
        it('package.json error', function(){
            try {
                _ti(__dirname);
                throw new Error("Didn't fail");
            } catch(e) {
                if(!/Cannot find module /.test(e.message))
                    throw e;
            }
        });
        it('compile error', function(){
            try {
                typeinclude("error");
                throw new Error("Didn't fail");
            } catch(e) {
                if(!/Cannot compile /.test(e.message))
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
    });

});
