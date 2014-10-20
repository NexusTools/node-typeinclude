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
var referencereg = /^@reference ([\"']?[\w\.\-\/]+[\"']?);?$/gm;
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
global.__typeinclude__loadcache__ = {};

function typeclean0(directory) {
    fs.readdirSync(directory).forEach(function(child) {
        var fullpath = path.resolve(directory, child);
        if(fs.lstatSync(fullpath).isDirectory())
            typeclean0(fullpath);
        else
            fs.unlinkSync(fullpath);
    });
}

function typeclean() {
    typeclean0(tempDirectory);
}

function typeclasspath(overrides) {
    var classPath;
    if(overrides && overrides != ".") {
        if((typeof overrides) == "string")
            classPath = [overrides];
        else
            classPath = overrides;
        globalClassPath.forEach(function(arg) {
            if(classPath.indexOf(arg) == -1)
                classPath.push(arg);
        });
        
        classPath.splice(arguments.length, 0, globalClassPath);
    } else
        classPath = globalClassPath.slice(0); // Create a copy
    
    return classPath;
}

function typeaddpath(path) {
    if(globalClassPath.indexOf(path) == -1)
        globalClassPath.push(path);
}

function typehaspath(path) {
    return globalClassPath.indexOf(path) != -1;
}

function typeremovepath(path) {
    var pos = globalClassPath.indexOf(path);
    if(pos > -1)
        globalClassPath.splice(pos, 1);
}

var $break = new Object();
function typeresolve(script, classpath) {
    classpath = classpath || typeclasspath();
    
    if(classpath instanceof Array) {
        if(!script.endsWith(".ts"))
            script += ".ts";
        
        var foundScript;
        try {
            classpath.forEach(function(cpath) {
                try {
                    foundScript = path.resolve(cpath, script);
                    fs.existsSync(foundScript);
                    throw $break;
                } catch(e) {
                    if(e != $break)
                        throw e;
                }
            });
        } catch(e) {
            if(e != $break)
                throw e;
        }
        script = foundScript;
        
    } else if(classpath instanceof Function) // TODO: Implement
        throw new Error("Functions as classpaths not supported yet");
    else if((typeof classpath) == "string") {
        script = path.resolve(classpath, script);
        if(!script.endsWith(".ts"))
            script += ".ts";

        // TODO: Figure out how to create a EEXIST error
        if(!fs.existsSync(script))
            throw new Error("No such file: " + script);
    }
        
    
	if(process.env.TYPEINCLUDE_VERBOSE)
		console.log("Resolved", script, "from", classpath);
    
    return script;
}

function typepath(script, classpath, dontResolve) {
    if(!dontResolve)
        classpath = classpath || typeclasspath(path.dirname(script));
    else {
        classpath = classpath || typeclasspath();
        script = typeresolve(script, classpath);
    }
    
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
    var needRequire = false;
    // TODO: Make this read part by part, not load the entire thing into memory
    var content = fs.readFileSync(script, {encoding: "utf8"});
    if(content.match(includereg)) {
        needRequire = true;
        content = "var _typeinclude = require(\"" + __filename + "\");\n" + content;
        content = content.replace(includereg, function(match, p1, offset, string) {
            p1 = splitArg(cleanArg(p1));
            if(!p1[1].endsWith(".ts"))
                p1[1] += ".ts";
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

            return "\n/// <reference path=\"" + preprocess[0] + "\" />\nvar " + p1[0] + " = _typeinclude(\"" + p1[1] + "\")";
        });
    }
    if(content.match(referencereg)) {
        content = content.replace(referencereg, function(match, p1, offset, string) {
            p1 = cleanArg(p1);
            if(!p1.endsWith(".ts"))
                p1 += ".ts";
            
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
    if(content.match(nodereqreg)) {
        needRequire = true;
        content = content.replace(nodereqreg, function(match, p1, offset, string) {
            p1 = splitArg(cleanArg(p1));
            return "var " + p1[0] + ":Function = require(\"" + p1[1] + "\")";
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
    if(needRequire)
        content = "declare var require:Function;\n" + content;
    content = "var __classpath = " + JSON.stringify(classpath) + ";\nvar __filename = " + JSON.stringify(script) + "\nvar __dirname = " + JSON.stringify(path.dirname(script)) + ";\n" + content;
    fs.writeFileSync(outputSource, content);
    
    var preprocessData = [outputSource, references, includes, target];
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
    if(!dontResolve)
        classpath = classpath || typeclasspath(path.dirname(script));
    else {
        classpath = classpath || typeclasspath();
        script = typeresolve(script, classpath);
    }
    
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
    
	if(!ignoreCaches && script in global.__typeinclude__loadcache__)
		return global.__typeinclude__loadcache__[script];
    
    var compiler = typecompile(script, classpath, undefined, true);
    compiler[1]();
    
	if(process.env.TYPEINCLUDE_VERBOSE)
		console.log("Requiring", compiler[0]);
	var requireInstance = require(compiler[0]);
	if(!ignoreCaches)
		global.__typeinclude__loadcache__[script] = requireInstance;
	return requireInstance;
}

typeinclude.path = typepath;
typeinclude.preprocess = typepreprocess;
typeinclude.compile = typecompile;
typeinclude.resolve = typeresolve;
typeinclude.clean = typeclean;

// Global Class Path
typeinclude.classpath = typeclasspath;
typeinclude.addclasspath = typeaddpath;
typeinclude.hasclasspath = typehaspath;
typeinclude.removeclasspath = typeremovepath;
module.exports = typeinclude;
