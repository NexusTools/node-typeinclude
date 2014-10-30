if(require.main === module)
    throw new Error("typeinclude is a library and has no runnable functionality");

// Load dependencies
require('string.prototype.startswith');
require('string.prototype.endswith');

var usleep = require("sleep").usleep;
var child_process = require("child_process");
var crypto = require('crypto');
var mkdirp = require("mkdirp");
var _ = require('underscore');
var path = require('path');
var fs = require('fs');
var os = require('os');

// Load other claasses
var paths = require(path.resolve(__dirname, "paths.js"));

// Initialize basics
var topDir = path.dirname(__dirname);
var version = require(path.resolve(topDir, 'package.json')).version;
var macroreg = /^@(\w+)(\s.+?)?;?(\/\/.+|\/\*.+)?$/gm;
var specificreg = /^(.+)\:(\w+)$/;
var hasExtension = /\.(\w+)$/;

// Parse NODE_PATH
var __nodePath = new paths();
if(process.env.NODE_PATH)
    __nodePath.add(process.env.NODE_PATH.split(":"));

// Resolve local paths
var parentDir;
var start = topDir;
if(path.basename(parentDir = path.dirname(start)) == "node_modules") {
    start = parentDir;
    while(path.basename(parentDir = path.dirname(path.dirname(start))) == "node_modules") {
        start = parentDir;
    }
}
var scanModule = function(dir, skipTest) {
    if(!skipTest && !_.isObject(require(path.resolve(dir, "package.json"))))
        throw "package.json corrupt";

    try {
        scanModules(path.resolve(dir, "node_modules"));
    } catch(e) {}
};
var scanModules = function(dir) {
    var hasValidModules = false;
    fs.readdirSync(dir).forEach(function(child) {
        if(child.startsWith("."))
            return;
        try {
            scanModule(path.resolve(dir, child));
            hasValidModules = true;
        } catch(e) {}
    });
    if(hasValidModules)
        __nodePath.add(dir);
};
if(start == topDir)
    scanModule(start, true);
else
    scanModules(start);

function cleanArg(arg) {
	if(/^["'].+["']$/.test(arg)) // Strip quotes
		return arg.substring(1, arg.length-1);
	return arg;
}

function splitArg(raw) {
	var specificMatch = raw.match(specificreg);
	if(specificMatch) {// Allows lib:varname syntax
		return [specificMatch[2], specificMatch[1]];
	}
	return [raw.replace(/\W/g, "_"), raw];
}

var cleandir;
cleandir = function(directory) {
    fs.readdirSync(directory).forEach(function(child) {
        var fullpath = path.resolve(directory, child);
        if(fs.lstatSync(fullpath).isDirectory()) {
            cleandir(fullpath);
            fs.rmdirSync(fullpath);
        } else
            fs.unlinkSync(fullpath);
    });
}

var processDirectory = path.dirname(process.argv[1]);
var baseTempDirectory = os.tmpdir();
baseTempDirectory += path.sep + "typeinclude-cache" + path.sep;
baseTempDirectory += (process.env.TYPESCRIPTINCLUDE_CACHENAMESPACE || process.getuid()) + path.sep;

var $break = new Object();
if(!("__typeinclude__" in global)) {
    global.__typeinclude__ = {
        "loadcache": {},
        "modulecache": {},
        "plugincache": {},
        "classfuncs": [],
        "nodepath": {},
        "tsc": __nodePath.resolve("typescript" + path.sep + "bin" + path.sep + "tsc")
    };
}

function _ti(topDir, classPath) {
    topDir = path.normalize(topDir);
    if(topDir.endsWith("/"))
        topDir = topDir.substring(0, topDir.length-1);
    if(topDir in global.__typeinclude__.modulecache)
        return global.__typeinclude__.modulecache[topDir];
    
    var instance = new TypeInclude(topDir, classPath);
    if(classPath)
        instance.add(classPath);
    
    var instanceFunc = function() {
        return instance.include.apply(instance, arguments);
    }
    
    for(var key in instance) {
        if(key.startsWith("_"))
            continue;
        
        var val = instance[key];
        if(_.isFunction(val))
            instanceFunc[key] = val;
    }
    
    return global.__typeinclude__.modulecache[topDir] = instanceFunc;
}

function addDotTS(script) {
    if(!hasExtension.test(script))
        script += ".ts";
    return script;
};
function TypeInclude(moduledir) {
    var pkg;
    try {
        pkg = require(path.resolve(moduledir, "package.json"));
    } catch(e) {
        if(process.env.TYPEINCLUDE_VERBOSE)
            console.error("typeinclude requires the path to a folder with a valid package.json");
        throw e;
    }
    var nodePath = new paths(__nodePath);
    
    
    var classPath = new paths(addDotTS, processDirectory);
    if("typesource" in pkg)
        classPath.add(path.resolve(moduledir, pkg.typesource));
    
    var tempDirectory = baseTempDirectory;
    // TODO: Make global and local macros
    var macros = {};
    var typeregistermacro = function(name, pattern, callback, replaceWith) {
        macros[name] = [pattern, callback, replaceWith];
    }

    var typeclean = function() {
        if(fs.existsSync(tempDirectory))
            cleandir(tempDirectory);
    }

    var typepath = function(script, classpath, dontResolve) {
        classpath = classPath.get(classpath || path.dirname(script));
        if(!dontResolve)
            script = classpath.resolve(script);

        var shasum = crypto.createHash('sha512');
        shasum.update(script);
        var hashDigest = shasum.digest("hex");
        var outputFile = tempDirectory + hashDigest.substring(0, 12) + path.sep;
        outputFile += hashDigest.substring(12, 80) + path.sep;
        outputFile += hashDigest.substring(80) + path.sep;
        mkdirp.sync(outputFile, 0777);
        if(!fs.existsSync(outputFile))
            throw new Error("Unable to create cache directory: " + outputFile);
        var outputFolder = outputFile;
        outputFile += path.basename(script, '.ts');
        var outputBase = outputFile;

        return [outputFolder,
                outputBase + ".js", // Compiled file
                outputBase + ".ts", // Preprocessed file
                outputBase + ".log", // Compile log
                outputBase + ".ver", // Compile version
                outputBase];
    }

    var typepreprocess0 = function(script, state) {
        var classpath = state[1];
        if(process.env.TYPEINCLUDE_VERBOSE)
            console.log("Preprocessing", script, "from", classpath);
        var scriptStat = state[2];

        var preprocessDataFile = state[0][5] + ".json";
        try {
            var outStat = fs.statSync(outputSource);
            if(scriptStat.mtime > outStat.mtime)
                throw "Script modified since last preprocess";

            var preprocessData = JSON.parse(fs.readFileSync(preprocessDataFile));
            if(preprocessData.length != 6)
                throw "Preprocess data corrupt";
            return preprocessData;
        } catch(e) {}

        var outputFolder = state[0][0];
        var outputFile = state[0][1];
        var outputSource = state[0][2];
        var outputLog = state[0][3];
        delete state;

        // TODO: Make this read part by part, not load the entire thing into memory
        var content = fs.readFileSync(script, {encoding: "utf8"});
        var context = {
            includes: [],
            references: [],
            classpath: classpath,
            disallowAutoCompile: false,
            needTypeinclude: false,
            needRequire: false,
            target: "ES3",
            strip: false
        };
        var foundMacros = [];
        content = content.replace(macroreg, function(match, p1, p2, offset, string) {
            var macroProcessor = macros[p1];
            if(!macroProcessor)
                throw new Error("Unhandled macro '@" + p1 + "' in" + script);
            
            if(p2)
                p2 = p2.substring(1);
            if(macroProcessor[0] && !macroProcessor[0].test(p2))
                throw new Error("Invalid format for macro '" + match + "'" + " in " + script);

            if(macroProcessor[1] && foundMacros.indexOf(macroProcessor) == -1) {
                macroProcessor[1].apply(context, [context]);
                foundMacros.push(macroProcessor);
            }

            return macroProcessor[2].apply(context, [match, p2, context]);
        });

        if(context.needTypeinclude)
            content = "var _typeinclude = require(" + JSON.stringify(__filename) + ")(" + JSON.stringify(moduledir) + ");\n" + content;
        if(context.needRequire)
            content = "declare var require:Function;\n" + content;
        content = "var __classpath = " + JSON.stringify(classpath) + ";\nvar __filename = " + JSON.stringify(script) + "\nvar __dirname = " + JSON.stringify(path.dirname(script)) + ";\n" + content;
        fs.writeFileSync(outputSource, content);
        if(!fs.existsSync(outputSource))
            throw new Error("Unable to write outputSource: " + outputSource);

        var preprocessData = [outputSource, context.references, context.includes, context.target, context.disallowAutoCompile, context.strip];
        fs.writeFileSync(preprocessDataFile, JSON.stringify(preprocessData));
        if(!fs.existsSync(preprocessDataFile))
            throw new Error("Unable to write preprocessData: " + preprocessDataFile);
        return preprocessData;
    }


    typeregistermacro("include",
                      /^([\"']?\w+[\"']?|[\"']?.+[\"']?:[\"']?\w+[\"']?)$/,
                      function(context) {
        context.needRequire = true;
        context.needTypeinclude = true;
    }, function(match, p1, context) {
        p1 = splitArg(cleanArg(p1));
        p1[1] = context.classpath.resolve(p1[1]);
        if(context.includes.indexOf(p1[1]) == -1)
            context.includes.push(p1[1]);
        if(context.references.indexOf(p1[1]) == -1)
            context.references.push(p1[1]);
        var preprocess = typepreprocess(p1[1], context.classpath, true);
        preprocess[1].forEach(function(ref) {
            if(context.references.indexOf(ref) == -1)
                context.references.push(ref);
        });
        preprocess[2].forEach(function(inc) {
            if(context.includes.indexOf(inc) == -1)
                context.includes.push(inc);
        });

        return "/// <reference path=\"" + preprocess[0] + "\" />\nvar " + p1[0] + " = _typeinclude(\"" + p1[1] + "\");";
    });

    typeregistermacro("reference",
                      /^([\"']?[\w\.\-\/]+[\"']?)$/,
                      undefined, function(match, p1, context) {
        p1 = cleanArg(p1);
        p1 = context.classpath.resolve(p1);
        if(context.references.indexOf(p1) == -1)
            context.references.push(p1);
        var preprocess = typepreprocess(p1, context.classpath, true);
        preprocess[1].forEach(function(ref) {
            if(context.references.indexOf(ref) == -1)
                context.references.push(ref);
        });

        return "/// <reference path=\"" + preprocess[0] + "\" />";
    });

    typeregistermacro("plugin",
                      /^([\"']?\w+[\"']?|[\"']?.+[\"']?:[\"']?\w+[\"']?)$/,
                      function(context) {
        context.needRequire = true;
        context.needTypeinclude = true;
    }, function(match, p1, context) {
        p1 = splitArg(cleanArg(p1));
        p1[1] = context.classpath.resolve(p1[1]);
        if(context.references.indexOf(p1[1]) == -1)
            context.references.push(p1[1]);
        var preprocess = typepreprocess(p1[1], context.classpath, true);
        preprocess[1].forEach(function(ref) {
            if(context.references.indexOf(ref) == -1)
                context.references.push(ref);
        });

        return "/// <reference path=\"" + preprocess[0] + "\" />\nvar " + p1[0] + " = _typeinclude.plugin(\"" + p1[1] + "\");";
    });

    typeregistermacro("pluginfor",
                      /^([\"']?\w+[\"']?|[\"']?.+[\"']?:[\"']?\w+[\"']?)$/,
                      undefined, function(match, p1, context) {
        p1 = splitArg(cleanArg(p1));
        p1[1] = context.classpath.resolve(p1[1]);
        if(context.references.indexOf(p1[1]) == -1)
            context.references.push(p1[1]);
        var preprocess = typepreprocess(p1[1], context.classpath, true);
        preprocess[1].forEach(function(ref) {
            if(context.references.indexOf(ref) == -1)
                context.references.push(ref);
        });

        return "/// <reference path=\"" + preprocess[0] + "\" />";
    });

    typeregistermacro("nodereq",
                      /^([\"']?\w+[\"']?|[\"']?.+[\"']?:[\"']?\w+[\"']?)$/,
                      function(context) {
        context.needRequire = true;
    }, function(match, p1, context) {
        p1 = splitArg(cleanArg(p1));
        
        var modulePath;
        try {
            modulePath = nodePath.resolve(p1[1] + path.sep + "package.json");
            var package = require(modulePath);
            modulePath = path.resolve(path.dirname(modulePath), package.main);
            if(!fs.existsSync(modulePath))
                throw "Main missing";
        } catch(e) {
            modulePath = p1[1];
        }

        return "var " + p1[0] + ":Function = require(\"" + modulePath + "\")";
    });

    typeregistermacro("noautocompile", undefined, undefined,
                      function(match, p1, context) {
        context.disallowAutoCompile = true;
        return "";
    });
    typeregistermacro("strip", /^(on|off|yes|no|true|false)$/i, undefined,
                      function(match, p1, context) {
        context.strip = /^(on|yes|true)$/i.test(p1);
        return "";
    });
    typeregistermacro("target", /^(ES3|ES5)$/i, undefined,
                      function(match, p1, context) {
        context.target = p1;
        return "";
    });
    typeregistermacro("main", /^([\"']?\w+[\"']?)$/, undefined,
                      function(match, p1, context) {
        return "declare var module:any;(module).exports = " + p1 + ";";
    });

    var typecompile0 = function(script, state, complete, noRecursive) {
        var scriptStat = state[2];
        var outputSource = state[0][2];
        var preprocessData = typepreprocess0(script, state);
        var includes = preprocessData[2];
        var target = preprocessData[3];
        var strip = preprocessData[4];
        delete preprocessData;

        var outputFolder = state[0][0];
        var outputFile = state[0][1];
        var outputLog = state[0][3];
        var outputVer = state[0][4];
        var outputFin = state[0][5] + ".fin";
        var classpath = state[1];
        delete state;

        try {
            fs.unlinkSync(outputFile);
        } catch(e) {}
        try {
            fs.unlinkSync(outputLog);
        } catch(e) {}
        try {
            fs.unlinkSync(outputFin);
        } catch(e) {}
        if(process.env.TYPEINCLUDE_VERBOSE)
            console.log("Compiling", script, "from", classpath);

        // TODO: Start compiling references
        var waitFor;
        if(complete) {
            waitFor = function() {
                throw new Error("complete callback passed, synchronous usage disabled");
            };
            throw new Error("asynchronous not implemented yet");
        } else {
            var otherWaits = [];
            if(!noRecursive) {
                if(process.env.TYPEINCLUDE_VERBOSE)
                    console.log("Compiling includes", includes);
                includes.forEach(function(include) {
                    var compiler = typecompile(include, classpath, undefined, true, true);
                    otherWaits.push(compiler[1]);
                });
            }
            waitFor = function() {
                // Wait for included stuff to compile
                otherWaits.forEach(function(otherWait) {
                    otherWait();
                });

                // Compile myself now
                while (!fs.existsSync(outputFin)) {
                    usleep(100000); // 100ms
                }

                try {
                    if(fs.statSync(outputFile).size < 1)
                        throw new Error("Generated empty file");
                    fs.utimesSync(outputFile, scriptStat.atime, scriptStat.mtime);
                    fs.writeFileSync(outputVer, version);
                } catch(e) {
                    try {
                        fs.unlinkSync(outputFile);
                    } catch(e) {}

                    if(process.env.TYPEINCLUDE_VERBOSE)
                        console.error("Compile Error:", e);
                    if(!fs.existsSync(outputLog))
                        throw new Error("No output log created: " + outputLog);
                    throw new Error("Cannot compile `" + script + "`\n" + fs.readFileSync(outputLog));
                }
            };

            var cmdLine = global.__typeinclude__.tsc + " --target \"" + target + "\" --sourcemap --module \"commonjs\" ";
            if(strip)
                cmdLine += "--removeComments ";
            cmdLine += "--out '" + outputFile + "' '" + outputSource + "' 2>&1 > '" + outputLog + "' || true; touch '" + outputFin + "'";
            if(process.env.TYPEINCLUDE_VERBOSE)
                console.log("Running", cmdLine);
            child_process.exec(cmdLine);
        }

        return waitFor;
    }

    var typecompile = function(script, classpath, complete, dontResolve, noRecursive) {
        classpath = classPath.get(classpath || path.dirname(script));
        if(!dontResolve)
            script = classpath.resolve(script);

        var waitFor = function() {};
        var tpath = typepath(script, undefined, true);
        var scriptStat = fs.statSync(script);
        try {
            var outStat = fs.statSync(tpath[1]);
            if(scriptStat.mtime > outStat.mtime)
                throw "Script modified since last compiled";

            var cVer = fs.readFileSync(tpath[4]);
            if(cVer != version)
                throw "Compiled using V" + cVer + " of typeinclude, now V" + version;
        } catch(e) {
            if(process.env.TYPEINCLUDE_VERBOSE)
                console.error(e);

            var state = [tpath, classpath, scriptStat];
            try {
                waitFor = typecompile0(script, [tpath, classpath, scriptStat], complete, noRecursive);
            } catch(e) {
                if(process.env.TYPEINCLUDE_VERBOSE) {
                    console.error(e);
                    try {
                        console.dir(e);
                    } catch(e) {}
                }
                throw e;
            }
        }

        if(!complete)
            return [tpath[1], waitFor];
        return tpath[1];
    }

    var typeautocompile0 = function(directory, classpath, asyncstate, ignoreNoAutoCompile, waitFors) {
        fs.readdirSync(directory).forEach(function(child) {
            var fullpath = path.resolve(directory, child);
            if(fs.lstatSync(fullpath).isDirectory())
                typeautocompile0(fullpath, classpath, asyncstate, ignoreNoAutoCompile, waitFors);
            else if(child.endsWith(".ts")) {
                try {
                    if(!ignoreNoAutoCompile) {
                        var preprocess = typepreprocess(fullpath, classpath);
                        if(preprocess[4]) // @noautocompile
                            return;
                    }
                    waitFors.push(typecompile(fullpath, classpath)[1]);
                } catch(e) {
                    // TODO: Store errors and retrrn them
                }
            }
        });
    }

    var typeautocompile = function(directory, classpath, complete, ignoreNoAutoCompile) {
        var waitFors = [];
        if(complete)
            throw new Error("Async autocompile not supported yet");
        typeautocompile0(directory, classpath, undefined, ignoreNoAutoCompile, waitFors);
        waitFors.forEach(function(waitFor) {
            try {
                waitFor();
            } catch(e) {
                // TODO: Store errors and output somewhere
            }
        });
    }

    var typepreprocess = function(script, classpath, dontResolve) {
        classpath = classPath.get(classpath || path.dirname(script));

        if(!dontResolve)
            script = classpath.resolve(script);
        var state = [typepath(script, undefined, true), classpath, fs.statSync(script)];
        return typepreprocess0(script, state);
    }

    var typeinclude = function(script, classpath, ignoreCaches) {
        classpath = classPath.get(classpath || path.dirname(script));

        if(process.env.TYPEINCLUDE_VERBOSE)
            console.log("Including", script, "from", classpath);
        if(!script || script == "." || script == "./")
            script = addDotTS(path.resolve(moduledir, pkg.typemain));
        else
            script = classpath.resolve(script);

        if(!ignoreCaches && script in global.__typeinclude__.loadcache)
            return global.__typeinclude__.loadcache[script];

        var compiler = typecompile(script, classpath, undefined, true);
        compiler[1]();

        if(process.env.TYPEINCLUDE_VERBOSE)
            console.log("Requiring", compiler[0]);
        var requireInstance = require(compiler[0]);
        if(!ignoreCaches)
            global.__typeinclude__.loadcache[script] = requireInstance;
        return requireInstance;
    }

    var typeplugin = function(script, classpath) {
        classpath = classPath.get(classpath || path.dirname(script));

        if(process.env.TYPEINCLUDE_VERBOSE)
            console.log("Loading Plugin", script, "from", classpath);
        script = classpath.resolve(script);

        if(script in global.__typeinclude__.plugincache)
            return global.__typeinclude__.plugincache[script];

        var plugin = {
            name: path.basename(script, ".ts"),
            impls: [],
            errors: []
        };
        plugin.storage = path.resolve(path.dirname(script), plugin.name);

        var files = fs.readdirSync(plugin.storage);
        files.sort();
        typeautocompile(plugin.storage, classpath, undefined, true);
        files.forEach(function(file) {
            try {
                var pluginImpl = typeinclude(path.resolve(plugin.storage, file), classpath);
                plugin.impls.push(new pluginImpl());
            } catch(e) {
                if(process.env.TYPEINCLUDE_VERBOSE)
                    console.error(e);
                plugin.errors.push(e);
            }
        });

        global.__typeinclude__.plugincache[script] = plugin;
        return plugin;
    }
    
    // Export methods
    this.path = typepath;
    this.include = typeinclude;
    this.preprocess = typepreprocess;
    this.autocompile = typeautocompile;
    this.registermacro = typeregistermacro;
    this.compile = typecompile;
    this.plugin = typeplugin;
    this.clean = typeclean;

    // Class Path
    this.resolve = _.bind(classPath.resolve, classPath);
    this.classpath = _.bind(classPath.get, classPath);
    this.addclasspath = _.bind(classPath.add, classPath);
    this.hasclasspath = _.bind(classPath.has, classPath);
    this.clearclasspath = _.bind(classPath.clear, classPath);
    this.removeclasspath = _.bind(classPath.remove, classPath);

    // Node Path
    this.resolvenode = _.bind(nodePath.resolve, nodePath);
    this.nodepath = _.bind(nodePath.get, nodePath);
    this.addnodepath = _.bind(nodePath.add, nodePath);
    this.hasnodepath = _.bind(nodePath.has, nodePath);
    this.clearnodepath = _.bind(nodePath.clear, nodePath);
    this.removenodepath = _.bind(nodePath.remove, nodePath);
};

module.exports = _ti;
