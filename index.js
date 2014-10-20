if(require.main === module)
    throw new Error("typeinclude is a library and has no runnable functionality");

require('string.prototype.startswith');
require('string.prototype.endswith');

var usleep = require("sleep").usleep;
var child_process = require("child_process");
var crypto = require('crypto');
var path = require('path');
var fs = require('fs');
var os = require('os');

var version = require(__dirname + path.sep + 'package.json').version;

var nodereqreg = /^@nodereq ([\"']?\w+[\"']?|[\"']?.+[\"']?:[\"']?\w+[\"']?);?$/gm;
var includereg = /^@include ([\"']?\w+[\"']?|[\"']?.+[\"']?:[\"']?\w+[\"']?);?$/gm;
var pluginreg = /^@plugin ([\"']?\w+[\"']?|[\"']?.+[\"']?:[\"']?\w+[\"']?);?$/gm;
var referencereg = /^@reference ([\"']?[\w\.\-\/]+[\"']?);?$/gm;
var noautocompilereg = /^@noautocompile;?$/m;
var targetreg = /^@target ([\"']?\w+[\"']?);?$/m;
var mainreg = /^@main ([\"']?\w+[\"']?);?$/gm;
var specificreg = /^(.+)\:(\w+)$/;

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

var processDirectory = path.dirname(process.argv[1]);
process.env.TYPESCRIPTINCLUDE_CACHENAMESPACE = process.env.TYPESCRIPTINCLUDE_CACHENAMESPACE || process.getuid();
var tempDirectory = os.tmpdir();
tempDirectory += path.sep + "typeinclude-cache" + path.sep;
var baseTempDirectory = tempDirectory;
tempDirectory += process.env.TYPESCRIPTINCLUDE_CACHENAMESPACE + path.sep;

var globalClassPath = [processDirectory];
global.__typeinclude__ = {
    "loadcache": {},
    "plugincache": {},
    "classfuncs": []
};

function typeclean0(directory) {
    fs.readdirSync(directory).forEach(function(child) {
        var fullpath = path.resolve(directory, child);
        if(fs.lstatSync(fullpath).isDirectory()) {
            typeclean0(fullpath);
            fs.rmdirSync(fullpath);
        } else
            fs.unlinkSync(fullpath);
    });
}

function typeclean() {
    if(fs.existsSync(tempDirectory))
        typeclean0(tempDirectory);
}

function typeclasspath(overrides) {
    var classPath;
    if(overrides && overrides != ".") {
        if(overrides instanceof Array)
            classPath = overrides.slice(0); // copy
        else
            classPath = [String(overrides)];
        globalClassPath.forEach(function(arg) {
            if(classPath.indexOf(arg) == -1)
                classPath.push(arg);
        });
    } else
        classPath = globalClassPath.slice(0); // Create a copy
    
    return classPath;
}

function typeaddpath(newpath) {
	if(arguments.length > 1) {
        Array.slice(arguments, 0).forEach(function(arg) {
            typeaddpath(arg);
        });
        return;
    }
	if(newpath instanceof Array) {
        newpath.forEach(function(cpath) {
            typeaddpath(cpath);
        });
        return;
    }
    if(newpath instanceof Function) {
        var pos = global.__typeinclude__.classfuncs.indexOf(newpath);
        if(pos == -1) {
            pos = global.__typeinclude__.classfuncs.length;
            global.__typeinclude__.classfuncs.push(newpath);
        }
        newpath = pos;
    } else
        newpath = path.resolve(processDirectory, String(newpath));

    if(globalClassPath.indexOf(newpath) == -1)
        globalClassPath.push(newpath);
}

function typehaspath(path) {
    // TODO: Make this recurse arrays
    
    if(path instanceof Function) {
        var pos = global.__typeinclude__.classfuncs.indexOf(path);
        if(pos == -1) {
            pos = global.__typeinclude__.classfuncs.length;
            global.__typeinclude__.classfuncs.push(path);
        }
        path = pos;
    } else
        path = String(path);
    
    return globalClassPath.indexOf(path) != -1;
}

function typeremovepath(path) {
    // TODO: Make this recurse arrays
    if(path instanceof Function) {
        var pos = global.__typeinclude__.classfuncs.indexOf(path);
        if(pos == -1) {
            pos = global.__typeinclude__.classfuncs.length;
            global.__typeinclude__.classfuncs.push(path);
        }
        path = pos;
    } else
        path = String(path);
    
    var pos = globalClassPath.indexOf(path);
    if(pos > -1)
        globalClassPath.splice(pos, 1);
}

var $break = new Object();
function typeresolve(script, classpath) {
    classpath = classpath || typeclasspath();
    
    if(classpath instanceof Array) {
        var scriptFile = script;
        if(!scriptFile.endsWith(".ts"))
            scriptFile += ".ts";
        
        var foundScript;
        try {
            function scanPath(scanpath) {
                scanpath.forEach(function(cpath) {
                    if(foundScript instanceof Array)
                        scanPath(foundScript);
                    else {
                        try {
                            if(isNaN(cpath))
                                throw "isNaN: " + cpath;
                            var func = global.__typeinclude__.classfuncs[cpath];
                            if(!func)
                                throw "false: " + cpath;
                            foundScript = func(script, classpath, scriptFile);
                        } catch(e) {
	                        if(process.env.TYPEINCLUDE_VERBOSE)
                                console.error(e);
                            foundScript = path.resolve(String(cpath), scriptFile);
                        }
                        if(fs.existsSync(foundScript))
                            throw $break;
                    }
                });
            }
            
            scanPath(classpath);
        } catch(e) {
            if(e != $break)
                throw e;
        }
        script = foundScript;
    } else if(classpath instanceof Function) // TODO: Implement
        throw new Error("Functions as classpaths not supported yet");
    else {
        script = path.resolve(String(classpath), script);
        if(!script.endsWith(".ts"))
            script += ".ts";
    }
    
    if(!fs.existsSync(script))
        throw new Error("No such file: " + script);
        
	if(process.env.TYPEINCLUDE_VERBOSE)
		console.log("Resolved", script, "from", classpath);
    
    return script;
}

function typepath(script, classpath, dontResolve) {
    classpath = classpath || typeclasspath(path.dirname(script));
    if(!dontResolve)
        script = typeresolve(script, classpath);
    
    try {
		fs.mkdirSync(baseTempDirectory);
	} catch(e) {
		if(e.code != "EEXIST")
			throw e;
	}
	try {
		fs.mkdirSync(tempDirectory, 0755);
	} catch(e) {
		if(e.code != "EEXIST")
			throw e;
	}
    
    var shasum = crypto.createHash('sha512');
	shasum.update(script);
	var hashDigest = shasum.digest("hex");
	var outputFile = tempDirectory + hashDigest.substring(0, 12) + path.sep;
	try {
		fs.mkdirSync(outputFile, 0755);
	} catch(e) {
		if(e.code != "EEXIST")
			throw e;
	}
	outputFile += hashDigest.substring(12, 80) + path.sep;
	try {
		fs.mkdirSync(outputFile, 0755);
	} catch(e) {
		if(e.code != "EEXIST")
			throw e;
	}
	outputFile += hashDigest.substring(80) + path.sep;
	try {
		fs.mkdirSync(outputFile, 0755);
	} catch(e) {
		if(e.code != "EEXIST")
			throw e;
	}
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

function typepreprocess0(script, state) {
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
        if(preprocessData.length != 4)
            throw "Preprocess data corrupt";
        return preprocessData;
    } catch(e) {}
    
    var outputFolder = state[0][0];
    var outputFile = state[0][1];
    var outputSource = state[0][2];
    var outputLog = state[0][3];
    var target = "ES3";
    delete state;
    
    var includes = [];
    var references = [];
    var disallowAutoCompile = false;
    var needRequire = false, needTypeinclude = false;
    // TODO: Make this read part by part, not load the entire thing into memory
    var content = fs.readFileSync(script, {encoding: "utf8"});
    if(content.match(includereg)) {
        needRequire = true;
        needTypeinclude = true;
        content = content.replace(includereg, function(match, p1, offset, string) {
            p1 = splitArg(cleanArg(p1));
            p1[1] = typeresolve(p1[1], classpath);
            if(includes.indexOf(p1[1]) == -1)
                includes.push(p1[1]);
            if(references.indexOf(p1[1]) == -1)
                references.push(p1[1]);
            var preprocess = typepreprocess(p1[1], classpath, true);
            preprocess[1].forEach(function(ref) {
                if(references.indexOf(ref) == -1)
                    references.push(ref);
            });
            preprocess[2].forEach(function(inc) {
                if(includes.indexOf(inc) == -1)
                    includes.push(inc);
            });

            return "/// <reference path=\"" + preprocess[0] + "\" />\nvar " + p1[0] + " = _typeinclude(\"" + p1[1] + "\");";
        });
    }
    if(content.match(referencereg)) {
        content = content.replace(referencereg, function(match, p1, offset, string) {
            p1 = cleanArg(p1);
            p1 = typeresolve(p1, classpath);
            if(references.indexOf(p1) == -1)
                references.push(p1);
            var preprocess = typepreprocess(p1, classpath, true);
            preprocess[1].forEach(function(ref) {
                if(references.indexOf(ref) == -1)
                    references.push(ref);
            });

            return "/// <reference path=\"" + preprocess[0] + "\" />";
        });
    }
    if(content.match(pluginreg)) {
        needRequire = true;
        needTypeinclude = true;
        content = content.replace(pluginreg, function(match, p1, offset, string) {
            p1 = splitArg(cleanArg(p1));
            p1[1] = typeresolve(p1[1], classpath);
            if(includes.indexOf(p1[1]) == -1)
                includes.push(p1[1]);
            if(references.indexOf(p1[1]) == -1)
                references.push(p1[1]);
            var preprocess = typepreprocess(p1[1], classpath, true);
            preprocess[1].forEach(function(ref) {
                if(references.indexOf(ref) == -1)
                    references.push(ref);
            });

            return "/// <reference path=\"" + preprocess[0] + "\" />\nvar " + p1[0] + " = _typeinclude.plugin(\"" + p1[1] + "\");";
        });
    }
    if(content.match(nodereqreg)) {
        needRequire = true;
        content = content.replace(nodereqreg, function(match, p1, offset, string) {
            p1 = splitArg(cleanArg(p1));
            return "var " + p1[0] + ":Function = require(\"" + p1[1] + "\")";
        });
    }
    if(content.match(noautocompilereg)) {
        content = content.replace(noautocompilereg, function(match, p1, offset, string) {
            disallowAutoCompile = true;
            return "";
        });
    }
    if(content.match(targetreg)) {
        content = content.replace(targetreg, function(match, p1, offset, string) {
            target = p1;
            return "";
        });
    }
    if(content.match(mainreg)) {
        content = content.replace(mainreg, function(match, p1, offset, string) {
            return "declare var module:any;(module).exports = " + p1 + ";";
        });
    }
    if(needTypeinclude)
        content = "var _typeinclude = require(\"" + __filename + "\");\n" + content;
    if(needRequire)
        content = "declare var require:Function;\n" + content;
    content = "var __classpath = " + JSON.stringify(classpath) + ";\nvar __filename = " + JSON.stringify(script) + "\nvar __dirname = " + JSON.stringify(path.dirname(script)) + ";\n" + content;
    fs.writeFileSync(outputSource, content);
    
    var preprocessData = [outputSource, references, includes, target, disallowAutoCompile];
    fs.writeFileSync(preprocessDataFile, JSON.stringify(preprocessData));
    return preprocessData;
}

function typecompile0(script, state, complete, noRecursive) {
    var scriptStat = state[2];
    var outputSource = state[0][2];
    var preprocessData = typepreprocess0(script, state);
    var includes = preprocessData[2];
    var target = preprocessData[3];
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

                console.error("Compile Error:", e);
                throw new Error("Failed to compile: " + script + "\nCheck " + outputLog + " for details");
            }
        };
        
        var cmdLine = "tsc --target \"" + target + "\" --sourcemap --module \"commonjs\" --out '" + outputFile + "' '" + outputSource + "' 2>&1 > '" + outputLog + "' || true; touch '" + outputFin + "'";
        if(process.env.TYPEINCLUDE_VERBOSE)
            console.log("Running", cmdLine);
        child_process.exec(cmdLine);
    }
    
    return waitFor;
}

function typecompile(script, classpath, complete, dontResolve, noRecursive) {
    classpath = classpath || typeclasspath(path.dirname(script));
    if(!dontResolve)
        script = typeresolve(script, classpath);
    
    var waitFor = function() {};
    var path = typepath(script, undefined, true);
	var scriptStat = fs.statSync(script);
	try {
		var outStat = fs.statSync(path[1]);
		if(scriptStat.mtime > outStat.mtime)
			throw "Script modified since last compiled";
        
        var cVer = fs.readFileSync(path[4]);
        if(cVer != version)
            throw "Compiled using V" + cVer + " of typeinclude, now V" + version;
	} catch(e) {
        if(process.env.TYPEINCLUDE_VERBOSE)
            console.error(e);
        
        var state = [path, classpath, scriptStat];
        try {
            waitFor = typecompile0(script, [path, classpath, scriptStat], complete, noRecursive);
        } catch(e) {
            console.error(e);
            try {
                console.dir(e);
            } catch(e) {}
            throw e;
        }
	}
    
    if(!complete)
        return [path[1], waitFor];
    return path[1];
}

function typeautocompile0(directory, classpath, asyncstate, ignoreNoAutoCompile, waitFors) {
    fs.readdirSync(directory).forEach(function(child) {
        var fullpath = path.resolve(directory, child);
        if(fs.lstatSync(fullpath).isDirectory())
            typeautocompile0(fullpath);
        else if(child.endsWith(".ts")) {
            if(!ignoreNoAutoCompile) {
                var preprocess = typepreprocess(fullpath, classpath);
                if(preprocess[4]) // @noautocompile
                    return;
            }
            waitFors.push(typecompile(fullpath, classpath)[1]);
        }
    });
}

function typeautocompile(directory, classpath, complete, ignoreNoAutoCompile) {
    var waitFors = [];
    if(complete)
        throw new Error("Async autocompile not supported yet");
    typeautocompile0(directory, classpath, undefined, ignoreNoAutoCompile, waitFors);
    waitFors.forEach(function(waitFor) {
        waitFor();
    });
}

function typepreprocess(script, classpath, dontResolve) {
    classpath = classpath || typeclasspath(path.dirname(script));
    
    if(!dontResolve)
        script = typeresolve(script, classpath);
    var state = [typepath(script, undefined, true), classpath, fs.statSync(script)];
    return typepreprocess0(script, state);
}

function typeinclude(script, classpath, ignoreCaches) {
    classpath = classpath || typeclasspath(path.dirname(script));
    
	if(process.env.TYPEINCLUDE_VERBOSE)
		console.log("Including", script, "from", classpath);
    script = typeresolve(script, classpath);
    
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

function typeplugin(script, classpath) {
    classpath = classpath || typeclasspath(path.dirname(script));
    
	if(process.env.TYPEINCLUDE_VERBOSE)
		console.log("Loading Plugin", script, "from", classpath);
    script = typeresolve(script, classpath);
    
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
            console.error(e);
            plugin.errors.push(e);
        }
    });
    
	global.__typeinclude__.plugincache[script] = plugin;
	return plugin;
}

typeinclude.path = typepath;
typeinclude.preprocess = typepreprocess;
typeinclude.autocompile = typeautocompile;
typeinclude.compile = typecompile;
typeinclude.resolve = typeresolve;
typeinclude.plugin = typeplugin;
typeinclude.clean = typeclean;

// Global Class Path
typeinclude.classpath = typeclasspath;
typeinclude.addclasspath = typeaddpath;
typeinclude.hasclasspath = typehaspath;
typeinclude.removeclasspath = typeremovepath;
module.exports = typeinclude;
