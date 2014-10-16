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

if(!("spawnSync" in child_process)) {
	child_process.spawnSync = function(command, args, opts) {
		var doneFile = tempDirectory + "_tsc.done";
		try {
			fs.unlinkSync(doneFile);
		} catch(e) {}
		// TODO: Improve concatenation, this is hacky...
		var cmdline = command + " \"" + args.join("\" \"") + "\" || true; touch " + doneFile;
		child_process.spawn('sh', ['-c', cmdline], opts);
		if(process.env.TYPEINCLUDE_VERBOSE)
			console.log(cmdline);
		
		while (!fs.existsSync(doneFile)) {
			usleep(100000); // 100ms
		}
		fs.unlinkSync(doneFile);
		
		return {}; // Fake it because I don't think we can make it... without native code...
	}
}

var nodereqreg = /^@nodereq (\w+|.+\:\w+)$/gm;
var includereg = /^@include (\w+|.+\:\w+)$/gm;
var referencereg = /^@reference ([\w\.\-\/]+)$/gm;
var mainreg = /^@main (\w+)$/gm;
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

global.__typeinclude__loadcache__ = {};

var typeresolve = function(script, classpath) {
    classpath = classpath || processDirectory;
    
    if(classpath instanceof Array) // TODO: Implement
        throw new Error("Arrays as classpaths not supported yet");
    if(classpath instanceof Function) // TODO: Implement
        throw new Error("Functions as classpaths not supported yet");
    
    script = path.resolve(classpath, script);
    if(!script.endsWith(".ts"))
        script += ".ts";
    
	if(process.env.TYPEINCLUDE_VERBOSE)
		console.log("Resolved", script, "from", classpath);
    
    return script;
}

var typepath = function(script, classpath, dontResolve) {
    if(!dontResolve)
        script = typeresolve(script, classpath);
    // TODO: Figure out how to create a EEXIST error
    if(!fs.existsSync(script))
        throw new Error("No such file: " + script);
    
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
            outputBase];
}

var typepreprocess0 = function(script, state) {
	if(process.env.TYPEINCLUDE_VERBOSE)
		console.log("Preprocessing", script, "from", classpath);
    
    var outputFolder = state[0][0];
    var outputFile = state[0][1];
    var outputSource = state[0][2];
    var outputLog = state[0][3];
    var classpath = state[1];
    delete state;
    
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
            if(!fs.existsSync(p1[1]))
                throw new Error("Included non-existent file: " + p1[1]);
            references.push(p1[1]);
            var reference = typepreprocess(p1[1], classpath)[0];

            return "\n/// <reference path=\"" + reference + "\" />\nvar " + p1[0] + " = _typeinclude(\"" + p1[1] + "\")";
        });
    }
    if(content.match(referencereg)) {
        content = content.replace(referencereg, function(match, p1, offset, string) {
            p1 = cleanArg(p1);
            if(!p1.endsWith(".ts"))
                p1 += ".ts";
            
            p1 = typeresolve(p1, classpath);
            if(!fs.existsSync(p1))
                throw new Error("Referenced non-existent file: " + p1);
            references.push(p1);
            p1 = typepreprocess(p1, classpath)[0];

            return "/// <reference path=\"" + p1 + "\" />";
        });
    }
    if(content.match(nodereqreg)) {
        needRequire = true;
        content = content.replace(nodereqreg, function(match, p1, offset, string) {
            p1 = splitArg(cleanArg(p1));
            return "var " + p1[0] + ":Function = require(\"" + p1[1] + "\")";
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
    
    return [outputSource, references];
}

var typecompile0 = function(script, state) {
	if(process.env.TYPEINCLUDE_VERBOSE)
		console.log("Compiling", script, "from", classpath);
    
    var scriptStat = state[2];
    var outputSource = state[0][2];
    try {
        var outStat = fs.statSync(outputSource);
		if(scriptStat.mtime > outStat.mtime)
			throw "Script modified since last preprocess";
    } catch(ex) {
        typepreprocess0(script, state);
    }
    
    var outputFolder = state[0][0];
    var outputFile = state[0][1];
    var outputLog = state[0][3];
    var classpath = state[1];
    delete state;
    
    try {
        fs.unlinkSync(outputFile);
    } catch(e) {}
    try {
        fs.unlinkSync(outputLog);
    } catch(e) {}

    // TODO: Use multiple processes with exec instead of spawn
    var result = child_process.spawnSync("tsc", ["--module", "commonjs", "--out", outputFile, outputSource], {
        stdio: ["ignore", fs.openSync(outputLog, 'a'), fs.openSync(outputLog, 'a')]
            });

    try {
        if(result.error)
            throw result.error;
        if(fs.statSync(outputFile).size < 1)
            throw new Error("Generated empty file");
        fs.utimesSync(outputFile, scriptStat.atime, scriptStat.mtime);
    } catch(e) {
        try {
            fs.unlinkSync(outputFile);
        } catch(e) {}
        try {
            fs.unlinkSync(outputLog);
        } catch(e) {}

        console.error("Compile Error:", e);
        throw new Error("Failed to compile: " + script + "\nCheck " + outputLog + " for details");
    }
    
    return outputFile;
}

var typecompile = function(script, classpath, dontResolve) {
    if(!dontResolve)
        script = typeresolve(script, classpath);
    var state = [typepath(script), classpath, fs.statSync(script)];
    return typecompile0(script, state);
}

var typepreprocess = function(script, classpath, dontResolve) {
    if(!dontResolve)
        script = typeresolve(script, classpath);
    var state = [typepath(script), classpath, fs.statSync(script)];
    return typepreprocess0(script, state);
}

var typeinclude = function(script, classpath, ignoreCaches) {
	if(process.env.TYPEINCLUDE_VERBOSE)
		console.log("Including", script, "from", classpath);
    script = typeresolve(script, classpath);
    
	if(!ignoreCaches && script in global.__typeinclude__loadcache__)
		return global.__typeinclude__loadcache__[script];
    
	var path = typepath(script, undefined, false);
	var scriptStat = fs.statSync(script);
	try {
		var outStat = fs.statSync(path[1]);
		if(scriptStat.mtime > outStat.mtime)
			throw "Script modified since last compiled";
	} catch(e) {
        var state = [path, classpath, scriptStat];
		typecompile0(script, state);
	}
	
	var requireInstance = require(path[1]);
	if(!ignoreCaches)
		global.__typeinclude__loadcache__[script] = requireInstance;
	return requireInstance;
}

typeinclude.path = typepath;
typeinclude.preprocess = typepreprocess;
typeinclude.compile = typecompile;
typeinclude.resolve = typeresolve;
module.exports = typeinclude;
