if(require.main === module)
    throw new Error("typeinclude is a library and has no runnable functionality");
var path = require('path');
var pkg = require(path.resolve(__dirname, 'package.json'));

var child_process = require("child_process");
var crypto = require('crypto');
var mkdirp = require("mkdirp");
var _ = require('lodash');
var fs = require('fs');
var os = require('os');

var logger;
try {
    logger = require("nulllogger");
    logger = new logger("e:typeinclude");

    if(!logger.gears || !logger.error)
        throw "Bad implementation";
} catch(e) {
    // Logging typeinclude isn't super important
    logger = {
        gears: _.noop,
        error: _.noop
    };
}

if(process.env.NO_HEAVY_LIFTING = process.env.NO_HEAVY_LIFTING || /^win/.test(process.platform))
	logger.warn("Disabling multi-process compilation");

// Load other classes
var paths = require("node-paths");
var nodeModules = ["os", "fs", "path", "http", "https", "stream", "dns", "url",
                   "util", "zlib", "crypto", "cluster", "domain", "events", "vm",
                  "punycode", "readline", "string_decoder", "tls", "dgram"];

var processDirectory = path.dirname(process.argv[1]);

// Initialize basics
var version = pkg.version;
var __nodePath = paths.sys.node.clone();
var macroreg = /^@(\w+)(\s.+?)?;?(\/\/.+|\/\*.+)?$/gm;
var specificreg = /^(.+)\:(\w+)$/;
var hasExtension = /\.(\w+)$/;

// Resolve local paths
var scanModule = function(dir, skipTest, nodePath) {
    if(!skipTest && !_.isObject(require(path.resolve(dir, "package.json"))))
        throw "package.json corrupt";

    try {
        scanModules(path.resolve(dir, "node_modules"), nodePath);
    } catch(e) {}
};
var scanModules = function(dir, nodePath) {
	if(nodePath.has(dir))
		return;

	var hasValidModules = false;
	fs.readdirSync(dir).forEach(function(child) {
		try {
			scanModule(path.resolve(dir, child), false, nodePath);
			hasValidModules = true;
		} catch(e) {}
	});
	if(hasValidModules)
		nodePath.add(dir);
};
var scanPackage = function(start, nodePath) {
	var parentDir;
	var rstart = start;
	if(path.basename(parentDir = path.dirname(start)) == "node_modules") {
		start = parentDir;
		while(path.basename(parentDir = path.dirname(path.dirname(start))) == "node_modules") {
			start = parentDir;
		}
	}
	logger.gears("Scanning package", start, rstart);
	if(start == rstart)
		scanModule(start, true, nodePath);
	else
		scanModules(start, nodePath);
	logger.debug("Scanned package", start, nodePath);
}
scanPackage(__dirname, __nodePath);

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

var typeincludePath = JSON.stringify(process.env.TYPEINCLUDE_DEVMODE ? __filename : "typeinclude");

var $break = new Object();
var __ti_cache = {
    "loadcache": {},
    "modulecache": {},
    "plugincache": {},
    "classfuncs": [],
    "nodepath": {}
};

try {
  __ti_cache.tsc = __nodePath.resolve("typescript" + path.sep + "bin" + path.sep + "tsc");
} catch(e) {
  logger.warn("tsc not found, compiling disabled", e.stack);
}

var endsWithSlash = /\/$/;
function _ti(topDir, classPath) {
    topDir = path.normalize(topDir);

    if(endsWithSlash.test(topDir))
        topDir = topDir.substring(0, topDir.length-1);
    if(topDir in __ti_cache.modulecache)
        return __ti_cache.modulecache[topDir];

    var instance = new TypeInclude(topDir);
    if(classPath)
        instance.addclasspath(classPath);

    var instanceFunc = function() {
        return instance.include.apply(instance, arguments);
    }

    for(var key in instance) {
        var val = instance[key];
        if(_.isFunction(val))
            instanceFunc[key] = val;
    }

    return __ti_cache.modulecache[topDir] = instanceFunc;
}

function addDotTS(script) {
    if(!hasExtension.test(script))
        script += ".ts";
    return script;
};
var endsWithJS = /\.js$/;
var endsWithTS = /\.ts$/;
function TypeInclude(moduledir) {
    var pkg;
    try {
        pkg = require(path.resolve(moduledir, "package.json"));
    } catch(e) {
        logger.error("typeinclude requires the path to a folder with a valid package.json");
        throw e;
    }
    logger.gears("Initializing TypeInclude", moduledir);

    var verbose = {
        discovered: _.identity,
        preprocessing: _.identity,
        preprocessed: _.identity,
        compiling: _.identity,
        compiled: _.identity,
        error: _.identity
    };
    var nodePath = new paths(__nodePath);
	   scanPackage(moduledir, nodePath);

    var registerverbose = function(_verbose) {
        _.extend(verbose, _verbose);
    }


    var classPath = new paths(addDotTS, processDirectory);
    if("typesource" in pkg)
        classPath.add(path.resolve(moduledir, pkg.typesource));

    var tempDirectory = path.resolve(moduledir, "compiled") + path.sep;
    mkdirp.sync(tempDirectory);

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

		logger.gears("Determining paths", script, moduledir);
        var outputFile = path.resolve(tempDirectory, path.relative(moduledir, script)) + path.sep;
        if(outputFile.indexOf(moduledir) !== 0)
          throw new Error("Cannot include files from outside package path: `" + moduledir + "`");

        mkdirp.sync(outputFile);
        if(!fs.existsSync(outputFile))
            throw new Error("Unable to create cache directory: " + outputFile);
        var outputFolder = outputFile;
        outputFile += "index";
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
        verbose.preprocessing(script, classpath);
        var scriptStat = state[2];

        var preprocessDataFile = state[0][5] + ".json";
        try {
            var outStat = fs.statSync(outputSource);
            if(scriptStat.mtime > outStat.mtime)
                throw "Script modified since last preprocess";

            var preprocessData = JSON.parse(fs.readFileSync(preprocessDataFile));
            if(preprocessData.length != 6)
                throw "Preprocess data corrupt";
            verbose.preprocessed(script, classpath);
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
            moduledir: moduledir,
            classpath: classpath,
            outputFile: outputFile,
            outputFolder: outputFolder,
            outputSource: outputSource,
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
            content = "var _typeinclude = require(" + typeincludePath + ")(__moduledir);\n" + content;
        if(context.needRequire)
            content = "declare var require:Function;\n" + content;

        var relativeFilename = path.relative(moduledir, script);
        content = "var __real_filename = __filename;\nvar __path_resolve = require(\"path\").resolve;\nvar __moduledir = __path_resolve(__filename, " + JSON.stringify(path.relative(outputSource, moduledir)) + ");\nvar __filename = __path_resolve(__moduledir, " + JSON.stringify(relativeFilename) + ")\nvar __dirname = __path_resolve(__moduledir, " + JSON.stringify(path.dirname(relativeFilename)) + ");\n" + content;

        fs.writeFileSync(outputSource, content);
        if(!fs.existsSync(outputSource))
            throw new Error("Unable to write outputSource: " + outputSource);

        var preprocessData = [outputSource, context.references, context.includes, context.target, context.disallowAutoCompile, context.strip];
        fs.writeFileSync(preprocessDataFile, JSON.stringify(preprocessData));
        if(!fs.existsSync(preprocessDataFile))
            throw new Error("Unable to write preprocessData: " + preprocessDataFile);
        verbose.preprocessed(script, classpath);
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

        return "/// <reference path=" + JSON.stringify(path.relative(p1[1], preprocess[0])) + " />\nvar " + p1[0] + " = _typeinclude(__path_resolve(__moduledir, " + JSON.stringify(path.relative(context.moduledir, p1[1])) + "));";
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

        return "/// <reference path=" + JSON.stringify(path.relative(p1, preprocess[0])) + " />";
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

        return "/// <reference path=" + JSON.stringify(path.relative(p1[1], preprocess[0])) + " />\nvar " + p1[0] + " = _typeinclude.plugin(__path_resolve(__moduledir, " + JSON.stringify(path.relative(context.moduledir, p1[1])) + "));";
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

        return "/// <reference path=" + JSON.stringify(path.relative(p1[1], preprocess[0])) + " />";
    });

    typeregistermacro("nodereq",
                      /^([\"']?\w+[\"']?|[\"']?.+[\"']?:[\"']?\w+[\"']?)$/,
                      function() {}, function(match, p1, context) {
        p1 = splitArg(cleanArg(p1));
        if(nodeModules.indexOf(p1[1]) != -1) {
            context.needRequire = true;
            return "var " + p1[0] + ":Function = require(" + JSON.stringify(p1[1]) + ")";
        }

            context.needTypeinclude = true;
        /*try {
        	var modulePath = nodePath.resolve(p1[1] + path.sep + "package.json");
		    var package = require(modulePath);
		    var main = package.main || "index.js";
		    if(!endsWithJS.test(main))
		    	main += ".js";

		    modulePath = path.resolve(path.dirname(modulePath), main);
		    if(!fs.existsSync(modulePath))
		        throw new Error("Main missing `" + modulePath + "`");

            return "var " + p1[0] + ":Function = _typeinclude.require(" + JSON.stringify(modulePath) + ")";
        } catch(e) {*/
            return "var " + p1[0] + ":Function = _typeinclude.require(" + JSON.stringify(p1[1]) + ")";
        //}
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
        verbose.compiling(outputFile, classpath);

        // TODO: Start compiling references
        if(complete)
            throw new Error("Callbacks not implemented yet.");
        else {
            if(!noRecursive) {
                includes.forEach(function(include) {
                    typecompile(include, classpath, undefined, true, true);
                });
            }

            var cmdLine = __ti_cache.tsc + " --target \"" + target + "\" --sourcemap --module \"commonjs\" ";
            if(strip)
                cmdLine += "--removeComments ";
            cmdLine += "--out '" + outputFile + "' '" + outputSource + "' 2>&1 > '" + outputLog + "' || true; touch '" + outputFin + "'";
            logger.gears("Running", cmdLine);
            child_process.execSync(cmdLine);

            try {
                if(fs.statSync(outputFile).size < 1)
                    throw new Error("Generated empty file");
                fs.utimesSync(outputFile, scriptStat.atime, scriptStat.mtime);
                fs.writeFileSync(outputVer, version);
            } catch(e) {
                try {
                    fs.unlinkSync(outputFile);
                } catch(e) {}

                logger.error("Compile Error:", e);
                if(!fs.existsSync(outputLog))
                    throw new Error("No output log created: " + outputLog);
                throw new Error("Cannot compile `" + script + "`\n" + fs.readFileSync(outputLog));
            }
        }
        
        return function() {}
    };

    var typecompile = function(script, classpath, complete, dontResolve, noRecursive) {
        try {
            classpath = classPath.get(classpath || path.dirname(script));
            if(!dontResolve)
                script = classpath.resolve(script);

            var waitFor = function() {};
            var tpath = typepath(script, undefined, true);
            if(__ti_cache.tsc) {
              var scriptStat = fs.statSync(script);
              try {
                  var outStat = fs.statSync(tpath[1]);
                  if(scriptStat.mtime > outStat.mtime)
                      throw "Script modified since last compiled";

                  var cVer = fs.readFileSync(tpath[4]);
                  if(cVer != version)
                      throw "Compiled using V" + cVer + " of typeinclude, now V" + version;
                  verbose.compiled(script, classpath);
              } catch(e) {
                  var state = [tpath, classpath, scriptStat];
                  try {
                      waitFor = typecompile0(script, [tpath, classpath, scriptStat], complete, noRecursive);
                  } catch(e) {
                      throw e;
                  }
              }
            }

            if(!complete)
                return [tpath[1], waitFor];
            return tpath[1];
        } catch(e) {
            verbose.error(script, classpath, e);
            throw e;
        }
    }

    var typeautocompile0 = function(directory, classpath, asyncstate, ignoreNoAutoCompile, waitFors) {
        fs.readdirSync(directory).forEach(function(child) {
            var fullpath = path.resolve(directory, child);
            if(fs.lstatSync(fullpath).isDirectory())
                typeautocompile0(fullpath, classpath, asyncstate, ignoreNoAutoCompile, waitFors);
            else if(endsWithTS.test(child)) {
                verbose.discovered(fullpath, classpath);
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
        try {
            classpath = classPath.get(classpath || path.dirname(script));

            if(!dontResolve)
                script = classpath.resolve(script);
            var state = [typepath(script, undefined, true), classpath, fs.statSync(script)];
            return typepreprocess0(script, state);
        } catch(e) {
            verbose.error(script, classpath, e);
            throw e;
        }
    }

    var typeinclude = function(script, classpath, ignoreCaches) {
        classpath = classPath.get(classpath || path.dirname(script));

        logger.gears("Resolving", script, "from", classpath);
        try {
            if(!script || script == "." || script == "./")
                script = addDotTS(path.resolve(moduledir, pkg.typemain));
            else
                script = classpath.resolve(script);
        } catch(e) {
            throw e;
        }

        logger.gears("Resolved", script);
        if(!ignoreCaches && script in __ti_cache.loadcache)
            return __ti_cache.loadcache[script];

        var compiler = typecompile(script, classpath, undefined, true);
        compiler[1]();

        logger.gears("Requiring", compiler[0]);
        var requireInstance = require(compiler[0]);
        if(!ignoreCaches)
            __ti_cache.loadcache[script] = requireInstance;
        return requireInstance;
    }

    var typeplugin = function(script, classpath) {
        classpath = classPath.get(classpath || path.dirname(script));

        logger.gears("Loading Plugin", script, "from", classpath);
        script = classpath.resolve(script);

        if(script in __ti_cache.plugincache)
            return __ti_cache.plugincache[script];

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
                logger.error(e);
                plugin.errors.push(e);
            }
        });

        __ti_cache.plugincache[script] = plugin;
        return plugin;
    }

    // Export methods
    this.path = typepath;
    this.include = typeinclude;
    this.preprocess = typepreprocess;
    this.autocompile = typeautocompile;
    this.registermacro = typeregistermacro;
    this.registerverbose = registerverbose;
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
    this.require = function(module, cachedModulePath) {
        try {
            return require(module);
        } catch(e) {}
        if(cachedModulePath)
            try {
                return require(cachedModulePath);
            } catch(e) {}

        var modulePath = nodePath.resolve(module + path.sep + "package.json");
        var package = require(modulePath);

        return require(path.dirname(modulePath));
    }
};

module.exports = _ti;
